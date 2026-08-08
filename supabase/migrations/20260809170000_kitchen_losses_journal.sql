-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION: get_kitchen_losses - le journal des pertes, trois sources unifiées
-- ═══════════════════════════════════════════════════════════════════
--
-- ⭐⭐ LE BESOIN (09/08/2026)
-- Neuf migrations ont rendu les pertes DÉCLARABLES : quantité, motif, auteur.
-- Mais rien ne les AFFICHE. Le promoteur voit deux totaux sur le tableau de
-- bord et ne peut pas savoir ce qu'ils recouvrent, ni qui a déclaré quoi.
--
-- > « c'est important pour la transparence » - l'exploitant, sur la traçabilité
--
-- ⛔ UN CHIFFRE SANS DÉTAIL NE SE CONTRÔLE PAS. La colonne `closed_by` ajoutée
-- ce jour-là ne servait à personne tant qu'aucun écran ne la lisait.
--
-- ⭐⭐ TROIS SOURCES, ET C'EST LE CŒUR DE CETTE FONCTION
--   1. PLAT ANNULÉ après `ready`  → `kitchen_order_items`
--      La matière est sortie, la vente n'a jamais eu lieu.
--   2. LOT DE PRODUCTION jeté     → `production_batches`
--      On a cuisiné plus que vendu.
--   3. LOT D'INGRÉDIENT perdu     → `ingredient_consumptions`
--      Périmé, abîmé, cassé.
--
-- ⚠️ LA 3e SOURCE N'APPARAISSAIT DANS AUCUNE MÉTRIQUE. `get_kitchen_metrics`
-- ne compte que les deux premières - vérifié le 09/08/2026. Les pertes
-- d'ingrédients étaient déclarables depuis ce jour et invisibles partout.
--
-- ⛔ LES TROIS RESTENT DISTINCTES (colonne `source`), jamais fusionnées : le
-- geste correctif diffère. Un plat annulé signale une erreur de commande, un
-- lot jeté une sur-production, un ingrédient perdu un problème d'achat ou de
-- conservation. Les additionner masquerait lequel corriger - même raison qui
-- a fait séparer `loss_count` et `batch_loss_count` (20260807210000).
--
-- ⭐ AUCUN MONTANT N'EST MASQUÉ ICI. La fonction les RETOURNE tous ; c'est le
-- CLIENT qui décide de les afficher selon `canViewKitchenCosts` (§8).
-- ⚠️ Choix ASSUMÉ et différent de `get_kitchen_production`, qui ne calcule
-- aucun montant justement pour que le cuisinier puisse l'appeler. Ici le
-- cuisinier VOIT le journal (« il est responsable des stocks » - arbitrage de
-- l'exploitant) mais pas les valeurs : le masquage est applicatif.
-- ⛔ Conséquence : la garde CLIENTE doit rester `canViewKitchenOrders`, et les
-- montants doivent être masqués à l'affichage. Un `canViewKitchenCosts` sur la
-- query fermerait l'écran au cuisinier ; l'oubli du masquage lui montrerait
-- les montants.
--
-- BREAKING_CHANGE: NO - création pure.
--
-- ROLLBACK_STRATEGY:
--   DROP FUNCTION IF EXISTS public.get_kitchen_losses(uuid,date,date);
--
-- FUNCTIONS_CREATED: public.get_kitchen_losses
-- TABLES_CREATED: (aucune)
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL                                                          │
-- └─────────────────────────────────────────────────────────────────┘
-- 1) La fonction ne doit PAS exister :
-- SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname='public' AND p.proname='get_kitchen_losses';
--   → 0 ligne.
--
-- 2) Les trois sources existent :
-- SELECT to_regclass('public.kitchen_order_items')      AS t_items,
--        to_regclass('public.production_batches')       AS t_batches,
--        to_regclass('public.ingredient_consumptions')  AS t_conso;
--   → les 3 NON NULL.
--
-- 3) Les colonnes d'auteur (ajoutées le 09/08 pour les lots) :
-- SELECT column_name FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='production_batches'
--    AND column_name IN ('closed_by','closed_at');
--   → 2 lignes. Sinon appliquer d'abord 20260809110000.

CREATE OR REPLACE FUNCTION public.get_kitchen_losses(
  p_bar_id     UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date   DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start   DATE;
  v_end     DATE;
  v_close   INTEGER;
  v_totals  RECORD;
BEGIN
  -- ⭐⭐ En SECURITY DEFINER la RLS ne s'applique pas : garde explicite.
  IF NOT (is_bar_member(p_bar_id) OR is_super_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accès refusé à ce bar');
  END IF;

  SELECT COALESCE(closing_hour, 6) INTO v_close FROM public.bars WHERE id = p_bar_id;
  v_close := COALESCE(v_close, 6);

  -- ⚠️ Défaut à 30 jours : une perte se lit sur une période, pas sur un jour.
  v_end   := COALESCE(p_end_date, CURRENT_DATE);
  v_start := COALESCE(p_start_date, v_end - 29);

  WITH
  /**
   * ⭐ SOURCE 1 — PLAT ANNULÉ APRÈS `ready`.
   *
   * ⛔ `consumed_at IS NOT NULL` est la condition CLÉ : un plat annulé AVANT
   *    d'être prêt n'a consommé aucune matière. L'inclure gonflerait les
   *    pertes de commandes qui n'ont rien coûté.
   * ⚠️ Borné sur `consumed_at` - le jour où la matière est SORTIE, pas celui
   *    de la commande. Même règle que partout depuis le 06/08.
   */
  plats AS (
    SELECT
      'dish'::TEXT                                   AS source,
      koi.consumed_at                                AS occurred_at,
      COALESCE(d.name, 'plat supprimé')              AS item_name,
      koi.quantity::NUMERIC                          AS qty,
      'portion'::TEXT                                AS unit,
      COALESCE(koi.computed_cost, 0)::NUMERIC        AS value,
      koi.cancel_reason                              AS reason,
      koi.cancelled_by                               AS actor_id
    FROM public.kitchen_order_items koi
    LEFT JOIN public.dishes d ON d.id = koi.dish_id
    WHERE koi.bar_id = p_bar_id
      AND koi.status = 'cancelled'
      AND koi.consumed_at IS NOT NULL
      AND koi.sale_id IS NULL
      AND DATE((koi.consumed_at AT TIME ZONE 'Africa/Porto-Novo')
               - (v_close || ' hours')::INTERVAL) BETWEEN v_start AND v_end
  ),

  /**
   * ⭐ SOURCE 2 — LOT DE PRODUCTION jeté ou périmé.
   *
   * ⚠️ `discarded_qty IS NOT NULL` : un lot `closed` (terminé sans reste) n'a
   *    rien perdu. Depuis le 09/08 le bouton « Terminer » a disparu, mais des
   *    lots antérieurs portent encore ce statut.
   */
  lots AS (
    SELECT
      'batch'::TEXT                                  AS source,
      pb.discarded_at                                AS occurred_at,
      COALESCE(d.name, 'plat supprimé')              AS item_name,
      pb.discarded_qty                               AS qty,
      'portion'::TEXT                                AS unit,
      (pb.discarded_qty * pb.unit_cost)::NUMERIC     AS value,
      COALESCE(pb.discard_reason, pb.status)         AS reason,
      pb.closed_by                                   AS actor_id
    FROM public.production_batches pb
    LEFT JOIN public.dishes d ON d.id = pb.dish_id
    WHERE pb.bar_id = p_bar_id
      AND pb.discarded_qty IS NOT NULL
      AND pb.discarded_at IS NOT NULL
      AND DATE((pb.discarded_at AT TIME ZONE 'Africa/Porto-Novo')
               - (v_close || ' hours')::INTERVAL) BETWEEN v_start AND v_end
  ),

  /**
   * ⭐⭐ SOURCE 3 — LOT D'INGRÉDIENT perdu. ABSENTE DE TOUTE MÉTRIQUE avant
   * cette fonction : `get_kitchen_metrics` ne compte que les deux premières.
   *
   * ⚠️ `reference_type = 'inventory_adjustment'` distingue une PERTE d'une
   *    consommation par recette. Sans ce filtre, chaque plat cuisiné
   *    apparaîtrait comme une perte.
   * ⚠️ Le motif vit dans `lot_breakdown`, un JSONB : les deux RPC de perte
   *    l'y écrivent sous `loss_reason`. `->0->>` lit le premier élément, seul
   *    présent pour une perte (contrairement à une consommation FEFO, qui
   *    peut couvrir plusieurs lots).
   * ⚠️ Borné sur `business_date` et non sur un horodatage : c'est la colonne
   *    que le RPC renseigne, déjà exprimée en journée commerciale.
   */
  ingredients AS (
    SELECT
      'ingredient'::TEXT                             AS source,
      ic.consumed_at                                 AS occurred_at,
      COALESCE(i.name, 'ingrédient supprimé')        AS item_name,
      ic.qty_consumed                                AS qty,
      COALESCE(i.unit, '')                           AS unit,
      COALESCE(ic.computed_cost, 0)::NUMERIC         AS value,
      (ic.lot_breakdown->0->>'loss_reason')          AS reason,
      ic.created_by                                  AS actor_id
    FROM public.ingredient_consumptions ic
    LEFT JOIN public.ingredients i ON i.id = ic.ingredient_id
    WHERE ic.bar_id = p_bar_id
      AND ic.reference_type = 'inventory_adjustment'
      AND ic.business_date BETWEEN v_start AND v_end
  ),

  toutes AS (
    SELECT * FROM plats
    UNION ALL SELECT * FROM lots
    UNION ALL SELECT * FROM ingredients
  ),

  /**
   * ⛔ PLAFOND SUR LES LIGNES AFFICHÉES - ajouté en code review le
   * 09/08/2026.
   *
   * Un bar à 300 tickets/jour produit ~120 lignes sur 30 jours : confortable.
   * Mais rien ne bornait ce JSONB - une période longue ou une activité
   * dix fois supérieure le ferait grossir sans limite, sur un téléphone en
   * cuisine.
   *
   * ⭐ 200 lignes : au-delà, personne ne fait défiler un journal. Qui cherche
   * plus loin réduit sa période.
   * ⚠️ Les TOTAUX sont calculés sur `toutes`, PAS sur cette version tronquée :
   * le montant affiché reste JUSTE même si le détail est coupé. L'inverse
   * ferait mentir le chiffre de tête.
   */
  bornees AS (
    SELECT * FROM toutes
    ORDER BY occurred_at DESC
    LIMIT 200
  )

  /**
   * ⛔⛔ UNE SEULE REQUÊTE POUR LES DEUX RÉSULTATS - correction du 09/08/2026,
   * après « relation « toutes » does not exist » au premier appel réel.
   *
   * Les CTE d'un `WITH` ne vivent que pour la requête qui SUIT immédiatement.
   * La version précédente enchainait deux `SELECT ... INTO` : le second ne
   * voyait plus `toutes` ni `bornees`.
   *
   * ⚠️ La CRÉATION de la fonction réussissait quand même - PL/pgSQL ne
   * résout ses requêtes qu'À L'EXÉCUTION. Les cinq contrôles du post-vol sont
   * donc TOUS passés au vert sur une fonction cassée : ils lisent la
   * signature, les privilèges et le texte, jamais un résultat.
   * ⛔ Le seul contrôle qui l'aurait vu est un appel RÉEL - or le smoke test
   * s'arrête sur la garde `is_bar_member` avant d'atteindre la requête.
   *
   * ⭐ Les deux agrégats sont désormais calculés en un seul passage :
   * `lines` sur la version BORNÉE, les totaux sur la version COMPLÈTE.
   */
  SELECT
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'source',      b.source,
          'occurred_at', b.occurred_at,
          'item_name',   b.item_name,
          'qty',         b.qty,
          'unit',        b.unit,
          -- ⚠️ MONTANT retourné : masqué par le CLIENT selon §8.
          'value',       ROUND(b.value, 2),
          'reason',      b.reason,
          -- ⭐ Le NOM, pas l'UUID : l'écran n'a pas à résoudre l'auteur.
          -- ⚠️ NULL sur les gestes antérieurs au 09/08 - un auteur ne
          --    s'invente pas rétroactivement.
          'actor_name',  u.name
        )
        -- ⭐ Le plus RÉCENT d'abord : on consulte un journal pour voir ce qui
        -- vient de se passer, pas pour remonter à l'origine.
        ORDER BY b.occurred_at DESC
      )
      FROM bornees b
      LEFT JOIN public.users u ON u.id = b.actor_id
    ), '[]'::JSONB)                                              AS lines,
    -- ⭐ Les TOTAUX portent sur `toutes` : ils doivent couvrir la période
    -- ENTIÈRE même quand le détail est tronqué, sinon le chiffre de tête
    -- mentirait.
    COALESCE(SUM(t.value), 0)                                    AS total_value,
    COUNT(*)                                                     AS total_count,
    COALESCE(SUM(t.value) FILTER (WHERE t.source = 'dish'), 0)   AS dish_value,
    COALESCE(SUM(t.value) FILTER (WHERE t.source = 'batch'), 0)  AS batch_value,
    COALESCE(SUM(t.value) FILTER (WHERE t.source = 'ingredient'), 0)
                                                                 AS ingredient_value
  INTO v_totals
  FROM toutes t;

  RETURN jsonb_build_object('success', false, 'error', 'Accès refusé à ce bar');
  END IF;

  SELECT COALESCE(closing_hour, 6) INTO v_close FROM public.bars WHERE id = p_bar_id;
  v_close := COALESCE(v_close, 6);

  -- ⚠️ Défaut à 30 jours : une perte se lit sur une période, pas sur un jour.
  v_end   := COALESCE(p_end_date, CURRENT_DATE);
  v_start := COALESCE(p_start_date, v_end - 29);

  WITH
  /**
   * ⭐ SOURCE 1 — PLAT ANNULÉ APRÈS `ready`.
   *
   * ⛔ `consumed_at IS NOT NULL` est la condition CLÉ : un plat annulé AVANT
   *    d'être prêt n'a consommé aucune matière. L'inclure gonflerait les
   *    pertes de commandes qui n'ont rien coûté.
   * ⚠️ Borné sur `consumed_at` - le jour où la matière est SORTIE, pas celui
   *    de la commande. Même règle que partout depuis le 06/08.
   */
  plats AS (
    SELECT
      'dish'::TEXT                                   AS source,
      koi.consumed_at                                AS occurred_at,
      COALESCE(d.name, 'plat supprimé')              AS item_name,
      koi.quantity::NUMERIC                          AS qty,
      'portion'::TEXT                                AS unit,
      COALESCE(koi.computed_cost, 0)::NUMERIC        AS value,
      koi.cancel_reason                              AS reason,
      koi.cancelled_by                               AS actor_id
    FROM public.kitchen_order_items koi
    LEFT JOIN public.dishes d ON d.id = koi.dish_id
    WHERE koi.bar_id = p_bar_id
      AND koi.status = 'cancelled'
      AND koi.consumed_at IS NOT NULL
      AND koi.sale_id IS NULL
      AND DATE((koi.consumed_at AT TIME ZONE 'Africa/Porto-Novo')
               - (v_close || ' hours')::INTERVAL) BETWEEN v_start AND v_end
  ),

  /**
   * ⭐ SOURCE 2 — LOT DE PRODUCTION jeté ou périmé.
   *
   * ⚠️ `discarded_qty IS NOT NULL` : un lot `closed` (terminé sans reste) n'a
   *    rien perdu. Depuis le 09/08 le bouton « Terminer » a disparu, mais des
   *    lots antérieurs portent encore ce statut.
   */
  lots AS (
    SELECT
      'batch'::TEXT                                  AS source,
      pb.discarded_at                                AS occurred_at,
      COALESCE(d.name, 'plat supprimé')              AS item_name,
      pb.discarded_qty                               AS qty,
      'portion'::TEXT                                AS unit,
      (pb.discarded_qty * pb.unit_cost)::NUMERIC     AS value,
      COALESCE(pb.discard_reason, pb.status)         AS reason,
      pb.closed_by                                   AS actor_id
    FROM public.production_batches pb
    LEFT JOIN public.dishes d ON d.id = pb.dish_id
    WHERE pb.bar_id = p_bar_id
      AND pb.discarded_qty IS NOT NULL
      AND pb.discarded_at IS NOT NULL
      AND DATE((pb.discarded_at AT TIME ZONE 'Africa/Porto-Novo')
               - (v_close || ' hours')::INTERVAL) BETWEEN v_start AND v_end
  ),

  /**
   * ⭐⭐ SOURCE 3 — LOT D'INGRÉDIENT perdu. ABSENTE DE TOUTE MÉTRIQUE avant
   * cette fonction : `get_kitchen_metrics` ne compte que les deux premières.
   *
   * ⚠️ `reference_type = 'inventory_adjustment'` distingue une PERTE d'une
   *    consommation par recette. Sans ce filtre, chaque plat cuisiné
   *    apparaîtrait comme une perte.
   * ⚠️ Le motif vit dans `lot_breakdown`, un JSONB : les deux RPC de perte
   *    l'y écrivent sous `loss_reason`. `->0->>` lit le premier élément, seul
   *    présent pour une perte (contrairement à une consommation FEFO, qui
   *    peut couvrir plusieurs lots).
   * ⚠️ Borné sur `business_date` et non sur un horodatage : c'est la colonne
   *    que le RPC renseigne, déjà exprimée en journée commerciale.
   */
  ingredients AS (
    SELECT
      'ingredient'::TEXT                             AS source,
      ic.consumed_at                                 AS occurred_at,
      COALESCE(i.name, 'ingrédient supprimé')        AS item_name,
      ic.qty_consumed                                AS qty,
      COALESCE(i.unit, '')                           AS unit,
      COALESCE(ic.computed_cost, 0)::NUMERIC         AS value,
      (ic.lot_breakdown->0->>'loss_reason')          AS reason,
      ic.created_by                                  AS actor_id
    FROM public.ingredient_consumptions ic
    LEFT JOIN public.ingredients i ON i.id = ic.ingredient_id
    WHERE ic.bar_id = p_bar_id
      AND ic.reference_type = 'inventory_adjustment'
      AND ic.business_date BETWEEN v_start AND v_end
  ),

  toutes AS (
    SELECT * FROM plats
    UNION ALL SELECT * FROM lots
    UNION ALL SELECT * FROM ingredients
  ),

  /**
   * ⛔ PLAFOND SUR LES LIGNES AFFICHÉES - ajouté en code review le
   * 09/08/2026.
   *
   * Un bar à 300 tickets/jour produit ~120 lignes sur 30 jours : confortable.
   * Mais rien ne bornait ce JSONB - une période longue ou une activité
   * dix fois supérieure le ferait grossir sans limite, sur un téléphone en
   * cuisine.
   *
   * ⭐ 200 lignes : au-delà, personne ne fait défiler un journal. Qui cherche
   * plus loin réduit sa période.
   * ⚠️ Les TOTAUX sont calculés sur `toutes`, PAS sur cette version tronquée :
   * le montant affiché reste JUSTE même si le détail est coupé. L'inverse
   * ferait mentir le chiffre de tête.
   */
  bornees AS (
    SELECT * FROM toutes
    ORDER BY occurred_at DESC
    LIMIT 200
  )


  RETURN jsonb_build_object(
    'success', TRUE,
    'start_date', v_start,
    'end_date', v_end,
    'total_value', ROUND(v_totals.total_value, 2),
    'total_count', v_totals.total_count,
    -- ⚠️ `true` si le détail est TRONQUÉ : l'écran doit le dire, sinon le
    -- promoteur croirait avoir tout vu.
    'truncated', v_totals.total_count > 200,
    'by_source', jsonb_build_object(
      'dish', ROUND(v_totals.dish_value, 2),
      'batch', ROUND(v_totals.batch_value, 2),
      'ingredient', ROUND(v_totals.ingredient_value, 2)
    ),
    'lines', v_totals.lines
  );
END;
$$;

COMMENT ON FUNCTION public.get_kitchen_losses(UUID, DATE, DATE) IS
  '⭐ Journal des pertes cuisine, TROIS sources unifiées : plats annulés après '
  'ready, lots de production jetés, lots d''ingrédients perdus. La 3e n''entre '
  'dans AUCUNE autre métrique. '
  '⛔ Les sources restent DISTINCTES (colonne `source`) : le geste correctif '
  'diffère - erreur de commande, sur-production, problème d''achat. '
  '⚠️ Les MONTANTS sont retournés ; c''est le CLIENT qui les masque selon '
  'canViewKitchenCosts (§8). La garde cliente doit rester canViewKitchenOrders '
  'pour que le cuisinier voie le journal - il répond du stock - sans les valeurs.';

-- ⛔⛔ `CREATE OR REPLACE` PERD LES GRANTS - leçon des vagues 1-4.
REVOKE ALL ON FUNCTION public.get_kitchen_losses(UUID, DATE, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_kitchen_losses(UUID, DATE, DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_kitchen_losses(UUID, DATE, DATE) TO authenticated;

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL                                                         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) La fonction existe, STABLE, SECURITY DEFINER :
-- SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args,
--        p.provolatile, p.prosecdef
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname='public' AND p.proname='get_kitchen_losses';
--   → 1 ligne, provolatile = 's', prosecdef = true.
--
-- 2) ⛔ Privilèges :
-- SELECT has_function_privilege('anon',
--          'public.get_kitchen_losses(uuid,date,date)','EXECUTE') AS anon_peut,
--        has_function_privilege('authenticated',
--          'public.get_kitchen_losses(uuid,date,date)','EXECUTE') AS auth_peut;
--   → anon_peut = false, auth_peut = true.
--
-- 3) ⚠️ LECTURE SEULE (commentaires retirés, sinon faux positif) :
-- SELECT regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g')
--          ~* '(INSERT|UPDATE|DELETE)\s' AS ecrit_en_base
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname='public' AND p.proname='get_kitchen_losses';
--   → false.
--
-- 4) ⭐ LES TROIS SOURCES SONT PRÉSENTES :
-- SELECT regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g')
--          ~ 'inventory_adjustment' AS lit_les_ingredients
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname='public' AND p.proname='get_kitchen_losses';
--   → true. C'est la source ABSENTE de toutes les autres métriques.
--
-- 5) SMOKE TEST - le refus est ATTENDU (auth.uid() vaut NULL ici) :
-- SELECT public.get_kitchen_losses(
--   (SELECT id FROM public.bars WHERE name ILIKE '%prestige bar 2%' LIMIT 1));
--   → {"success": false, "error": "Accès refusé à ce bar"} = garde OK.
--
-- 6) TEST RÉEL DEPUIS L'UI, après avoir déclaré une perte de chaque type :
--    → les trois apparaissent dans le journal, avec leur motif et leur auteur ;
--    → le total en tête égale la somme des lignes affichées TANT QUE
--      `truncated` est false. Au-delà de 200 pertes, le total couvre la
--      période ENTIÈRE alors que le détail est coupé - c'est VOULU, et
--      l'écran l'annonce.
--    → connecté en CUISINIER : les lignes sont visibles, les montants NON.
