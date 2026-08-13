-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION: get_kitchen_queue_shortfalls — ajout des manques de LOTS
-- ═══════════════════════════════════════════════════════════════════
--
-- ⛔⛔ DÉFAUT CORRIGÉ — trouvé au test terrain du 08/08/2026.
-- La version 20260808160000 ne regardait QUE les ingrédients. Sur un plat
-- `batch_finish` (qui prélève dans un LOT), elle annonçait un manque de
-- matière première alors que le vrai risque est le lot épuisé — et
-- inversement, elle se taisait quand le lot manquait.
--
-- ⚠️ CE N'EST PAS LE MÊME RISQUE, ni le même geste de réparation :
--   · ingrédient manquant → approvisionner ;
--   · lot manquant        → PRODUIRE, ou basculer la ligne à la commande.
-- Les confondre donnerait une alerte sans action claire.
--
-- ⭐⭐ ASYMÉTRIE MÉTIER ESSENTIELLE (§16.9, arbitrage du 07/08/2026)
--   · un ingrédient manquant N'A AUCUNE alternative → dette, jamais de refus ;
--   · un lot manquant EN A UNE (cuisiner à la commande) → `accept_kitchen_item`
--     REFUSE avec alternative.
-- L'avertissement est donc PLUS UTILE ici que pour les ingrédients : il
-- annonce un REFUS à venir, pas seulement une dette. Le cuisinier peut
-- produire avant de se heurter au blocage.
--
-- BREAKING_CHANGE: NO — même signature, sortie ENRICHIE d'une clé
--   `batch_shortfalls`. La clé `shortfalls` existante est INCHANGÉE : un
--   client déployé avant cette migration continue de fonctionner.
--
-- ROLLBACK_STRATEGY:
--   Réappliquer 20260808160000_kitchen_queue_shortfalls.sql tel quel.
--
-- FUNCTIONS_CREATED: (aucune — CREATE OR REPLACE de l'existante)
-- TABLES_CREATED: (aucune)
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL                                                          │
-- └─────────────────────────────────────────────────────────────────┘
-- 1) La fonction à remplacer existe, en UN exemplaire :
-- SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname='public' AND p.proname='get_kitchen_queue_shortfalls';
--   → 1 ligne, args = 'p_bar_id uuid'.
--   ⛔ Si 0 ligne : appliquer d'abord 20260808160000.
--   ⛔ Si 2 lignes : une surcharge existe — ARRÊTER.
--
-- 2) Tables des lots et de la composition :
-- SELECT to_regclass('public.production_batches')     AS t_batches,
--        to_regclass('public.dish_recipe_components') AS t_components;
--   → les 2 NON NULL.

CREATE OR REPLACE FUNCTION public.get_kitchen_queue_shortfalls(
  p_bar_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result   JSONB;
  v_batches  JSONB;
BEGIN
  -- ⭐⭐ ISOLATION MULTI-TENANT — inchangée. En `SECURITY DEFINER` la RLS ne
  --    s'applique pas : sans cette garde, le stock d'un autre bar serait
  --    lisible en passant son UUID.
  IF NOT (is_bar_member(p_bar_id) OR is_super_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accès refusé à ce bar');
  END IF;

  -- ═════════════════════════════════════════════════════════════════
  -- PARTIE 1 — MANQUES D'INGRÉDIENTS (inchangée depuis 20260808160000)
  -- ═════════════════════════════════════════════════════════════════
  WITH
  queue AS (
    SELECT koi.dish_id, koi.quantity, koi.forced_on_order
    FROM public.kitchen_order_items koi
    WHERE koi.bar_id = p_bar_id
      AND koi.status IN ('pending', 'accepted')
  ),
  modes AS (
    SELECT d.id AS dish_id, d.production_mode AS mode
    FROM public.dishes d
    WHERE d.bar_id = p_bar_id
  ),
  /**
   * ⛔ LE FILTRE DE STADE EST CONDITIONNÉ, JAMAIS GLOBAL.
   *    `consumed_at_stage` a pour défaut 'batch' : un filtre inconditionnel
   *    sur 'finish' écarterait les ingrédients de TOUS les plats existants et
   *    annoncerait « rien ne manque » en permanence.
   * ⛔ `is_optional` NON filtré : il exclut du calcul de COÛT, pas de la
   *    CONSOMMATION.
   * ⭐ Quantité BRUTE = quantity / yield_factor (DIVISION), garde sur 0.
   */
  needs AS (
    SELECT di.ingredient_id,
           SUM(ROUND((di.quantity / COALESCE(NULLIF(di.yield_factor, 0), 1)) * q.quantity, 3)) AS required
    FROM queue q
    JOIN modes m ON m.dish_id = q.dish_id
    JOIN public.dish_ingredients di
      ON di.dish_id = q.dish_id AND di.bar_id = p_bar_id
    WHERE (q.forced_on_order
           OR m.mode <> 'batch_finish'
           OR di.consumed_at_stage = 'finish')
    GROUP BY di.ingredient_id
  ),
  /**
   * ⭐⭐ Disponible = Σ lots actifs − Σ DETTES OUVERTES — formule exacte de
   *    `consume_ingredients_fefo` (l. 431-441). Omettre les dettes ferait
   *    SOUS-ESTIMER le manque : l'erreur qui rassure à tort.
   */
  available AS (
    SELECT i.id AS ingredient_id, i.name, i.unit, i.cost_mode,
           COALESCE(SUM(l.remaining_qty), 0) - COALESCE((
             SELECT SUM(d.qty_owed - d.settled_qty)
             FROM public.ingredient_stock_debts d
             WHERE d.ingredient_id = i.id
               AND d.bar_id = p_bar_id
               AND d.status = 'open'
           ), 0) AS in_stock
    FROM public.ingredients i
    LEFT JOIN public.ingredient_lots l
      ON l.ingredient_id = i.id
     AND l.bar_id = p_bar_id
     AND l.status = 'active'
     AND l.remaining_qty > 0
    WHERE i.bar_id = p_bar_id
    GROUP BY i.id, i.name, i.unit, i.cost_mode
  )
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'ingredient_id', a.ingredient_id,
             'name',          a.name,
             'unit',          a.unit,
             'required',      n.required,
             'available',     a.in_stock,
             'missing',       ROUND(n.required - a.in_stock, 3)
           ) ORDER BY (n.required - a.in_stock) DESC
         ), '[]'::JSONB)
  INTO v_result
  FROM needs n
  JOIN available a ON a.ingredient_id = n.ingredient_id
  -- ⛔ Seul `direct` décrémente (§16.3) : alerter sur l'huile serait faux.
  WHERE a.cost_mode = 'direct'
    AND n.required > a.in_stock;

  -- ═════════════════════════════════════════════════════════════════
  -- PARTIE 2 — MANQUES DE LOTS (nouveau)
  -- ═════════════════════════════════════════════════════════════════
  WITH
  queue AS (
    SELECT koi.dish_id, koi.quantity, koi.forced_on_order
    FROM public.kitchen_order_items koi
    WHERE koi.bar_id = p_bar_id
      AND koi.status IN ('pending', 'accepted')
  ),
  /**
   * ⭐⭐ SEULS LES PLATS `batch_finish` PRÉLÈVENT DANS UN LOT.
   *
   * ⛔ `forced_on_order` EXCLU — réplique de `mark_ready` (l. 476) : une ligne
   *    basculée cuisine la recette ENTIÈRE et ne touche AUCUN lot. L'inclure
   *    annoncerait un manque de lot pour une assiette qui n'en prélèvera pas.
   *
   * ⚠️ `d.production_mode` du plat VENDU, pas du plat-base : c'est lui qui
   *    porte le régime (§16.8).
   */
  batch_needs AS (
    SELECT drc.base_dish_id,
           SUM(ROUND(drc.quantity * q.quantity, 3)) AS required
    FROM queue q
    JOIN public.dishes d
      ON d.id = q.dish_id AND d.bar_id = p_bar_id
    JOIN public.dish_recipe_components drc
      ON drc.dish_id = q.dish_id AND drc.bar_id = p_bar_id
    WHERE NOT q.forced_on_order
      AND d.production_mode = 'batch_finish'
    GROUP BY drc.base_dish_id
  ),
  /**
   * ⭐ Portions disponibles = Σ `remaining_qty` des lots ACTIFS.
   *
   * ⚠️ `status = 'active'` SEULEMENT — mêmes prédicats que `mark_ready`
   *    (l. 301-305). Un lot 'closed', 'discarded' ou 'depleted' n'est plus
   *    prélevable ; le compter annoncerait des portions qui n'existent pas.
   *
   * ⚠️ LEFT JOIN + COALESCE : un plat-base SANS AUCUN lot doit apparaître
   *    avec 0. C'est le cas le plus courant et le plus grave — aucune
   *    production lancée.
   */
  batch_available AS (
    SELECT bn.base_dish_id,
           COALESCE((SELECT d2.name FROM public.dishes d2 WHERE d2.id = bn.base_dish_id),
                    'plat de base') AS name,
           COALESCE((
             SELECT SUM(pb.remaining_qty)
             FROM public.production_batches pb
             WHERE pb.bar_id = p_bar_id
               AND pb.dish_id = bn.base_dish_id
               AND pb.status = 'active'
           ), 0) AS in_stock
    FROM batch_needs bn
  )
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'base_dish_id', a.base_dish_id,
             'name',         a.name,
             'required',     n.required,
             'available',    a.in_stock,
             'missing',      ROUND(n.required - a.in_stock, 3)
           ) ORDER BY (n.required - a.in_stock) DESC
         ), '[]'::JSONB)
  INTO v_batches
  FROM batch_needs n
  JOIN batch_available a ON a.base_dish_id = n.base_dish_id
  WHERE n.required > a.in_stock;

  /**
   * ⚠️ DEUX CLÉS DISTINCTES, jamais fusionnées. Le geste de réparation
   * diffère : approvisionner pour un ingrédient, PRODUIRE pour un lot. Une
   * liste unique laisserait le cuisinier sans action claire.
   * ⭐ `shortfalls` garde son nom et sa forme : un client antérieur à cette
   * migration continue de fonctionner (pas de BREAKING_CHANGE).
   */
  RETURN jsonb_build_object(
    'success', TRUE,
    'shortfalls', v_result,
    'batch_shortfalls', v_batches
  );
END;
$$;

COMMENT ON FUNCTION public.get_kitchen_queue_shortfalls(UUID) IS
  'Ce qui manquera pour la file en cours (pending + accepted). DEUX listes : '
  '`shortfalls` = ingrédients (cost_mode direct, Σ lots − Σ dettes ouvertes), '
  '`batch_shortfalls` = portions de lots pour les plats batch_finish non '
  'basculés. Gestes de réparation différents : approvisionner vs PRODUIRE. '
  'AVERTISSEMENT seulement pour les ingrédients (dette, §4.4) ; pour les LOTS '
  'il annonce un vrai REFUS à venir (§16.9). Lecture seule, ne consomme rien. '
  'AUCUN MONTANT (§8) — destinée au cuisinier.';

-- ⛔⛔ `CREATE OR REPLACE` PERD LES GRANTS — leçon des vagues 1-4.
REVOKE ALL ON FUNCTION public.get_kitchen_queue_shortfalls(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_kitchen_queue_shortfalls(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_kitchen_queue_shortfalls(UUID) TO authenticated;

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL                                                         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) Toujours UNE seule fonction, STABLE, SECURITY DEFINER :
-- SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args,
--        p.provolatile, p.prosecdef
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname='public' AND p.proname='get_kitchen_queue_shortfalls';
--   → 1 ligne, 'p_bar_id uuid', provolatile='s', prosecdef=true.
--
-- 2) ⛔ Les GRANTS ont survécu au REPLACE :
-- SELECT has_function_privilege('anon',
--          'public.get_kitchen_queue_shortfalls(uuid)','EXECUTE') AS anon_peut,
--        has_function_privilege('authenticated',
--          'public.get_kitchen_queue_shortfalls(uuid)','EXECUTE') AS auth_peut;
--   → anon_peut=false, auth_peut=true. Sinon rejouer le bloc REVOKE/GRANT.
--
-- 3) Toujours en LECTURE SEULE (commentaires retirés avant de chercher, sinon
--    faux positif — leçon du post-vol `loss_cost`) :
-- SELECT regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g')
--          ~* '(INSERT|UPDATE|DELETE)\s' AS ecrit_en_base
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname='public' AND p.proname='get_kitchen_queue_shortfalls';
--   → false.
--
-- 4) La nouvelle clé est bien présente dans le corps :
-- SELECT pg_get_functiondef(p.oid) LIKE '%batch_shortfalls%' AS a_la_cle
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname='public' AND p.proname='get_kitchen_queue_shortfalls';
--   → true.
--
-- 5) SMOKE TEST — le refus est le résultat ATTENDU (auth.uid() vaut NULL dans
--    le SQL Editor) :
-- SELECT public.get_kitchen_queue_shortfalls(
--   (SELECT id FROM public.bars WHERE name ILIKE '%prestige bar 2%' LIMIT 1));
--   → {"success": false, "error": "Accès refusé à ce bar"} = garde OK.
--
-- 6) Test réel DEPUIS L'UI : configurer un plat de vente `on_order` avec une
--    composition pointant un plat-base « préparé d'avance », ne produire AUCUN
--    lot, envoyer le plat en cuisine → le bandeau doit annoncer le manque de
--    PORTIONS (et non un manque d'ingrédients).
