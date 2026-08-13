-- ===================================================================
-- MIGRATION: get_top_products_aggregated distingue les PLATS
-- DATE: 2026-08-05
-- AUTHOR: AI Assistant
-- PHASE: 3A du module restauration (§8)
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BUSINESS CONTEXT                                                │
-- └─────────────────────────────────────────────────────────────────┘

-- PROBLEM:
--   Signalé en test terrain le 05/08/2026 : « pourquoi avec le sélecteur
--   Tout, j'ai Poulet braisé dans top produits ? »
--
--   ⛔ La RPC groupe sur `(item->>'product_id')::uuid`. Un PLAT n'en a pas :
--   il porte `item_type: 'dish'` et `dish_id` (§4.2). TOUS les plats tombent
--   donc dans UN SEUL groupe NULL, nommé par `MAX(product_name)`.
--
--   ⚠️ LE DÉFAUT NE SE VOIT PAS AUJOURD'HUI — un seul plat existe sur le bar
--   de test, le groupe porte son nom et paraît correct. AU DEUXIÈME PLAT,
--   « Poulet braisé » et « Riz sauce » fusionneraient en une ligne unique,
--   quantités et CA additionnés, portant le nom du dernier alphabétiquement.
--   Le promoteur lirait « Poulet braisé : 12 unités » dont 5 sont du riz.

-- ⛔ DEUXIÈME DÉFAUT, PLUS INSIDIEUX : LA MARGE
--   `profit = total_revenue - (total_quantity * cump)` où `cump` vient de
--   `bar_products.current_average_cost` — table où un plat N'EXISTE PAS.
--   `COALESCE(..., 0)` donne donc un coût de ZÉRO : l'axe « Marge » affiche
--   100 % sur tous les plats. Un promoteur y verrait ses plats comme les plus
--   rentables de sa carte.
--   ⭐ Le coût RÉEL existe : `kitchen_order_items.computed_cost`, figé au
--   décrément FEFO (§6). C'est le même chiffre que celui de get_kitchen_metrics
--   — une seule source de vérité pour le coût matière.

-- ⭐⭐ INVARIANCE DES BARS PURS (§3) — LA CONTRAINTE QUI DOMINE CETTE MIGRATION
--   Cette RPC est appelée par TOUS les bars, sur l'écran Analytique.
--   ⚠️ La clé de groupement reste `product_id` DÈS QU'IL EXISTE : le chemin
--   des boissons est rigoureusement inchangé, ligne pour ligne. Seules les
--   lignes SANS product_id (donc les plats) empruntent la nouvelle branche.
--   Un bar sans cuisine n'en a aucune → résultat identique à l'octet près.

-- BREAKING_CHANGE: NO
--   Signature identique (mêmes paramètres, même RETURNS TABLE). Les colonnes
--   `product_id` restent NULL pour un plat — aucun client ne s'en sert comme
--   clé, ils affichent `product_name`.

-- ROLLBACK_STRATEGY:
--   Réappliquer la définition précédente (récupérable via pg_get_functiondef
--   avant application — À SAUVEGARDER, cf. pré-vol 3).

-- FUNCTIONS_MODIFIED: get_top_products_aggregated (CREATE OR REPLACE)
-- TABLES_MODIFIED: aucune · RLS_CHANGES: aucune

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL                                                          │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ BLOQUANT — une seule version, signature exacte :
--
--    SELECT p.oid, pg_get_function_identity_arguments(p.oid) AS args,
--           p.prosecdef, p.proconfig
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.proname='get_top_products_aggregated';
--    -- ATTENDU : 1 ligne · uuid, date, date, integer, text · true
--
-- 2) ⛔ BLOQUANT — dépendance cuisine :
--
--    SELECT to_regclass('public.kitchen_order_items') AS t;
--    -- ATTENDU : non NULL
--
-- 3) ⭐⭐ SAUVEGARDER LA DÉFINITION ACTUELLE — c'est le SEUL rollback :
--
--    SELECT pg_get_functiondef(p.oid)
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.proname='get_top_products_aggregated';
--    -- ⚠️ COPIER LE RÉSULTAT AVANT D'APPLIQUER.
--
-- 4) ⭐ PHOTOGRAPHIE ANTI-RÉGRESSION — le post-vol doit retrouver ces lignes
--    À L'IDENTIQUE sur un bar PUR (remplacer <BAR_PUR>) :
--
--    SELECT product_name, total_quantity, total_revenue, profit
--    FROM public.get_top_products_aggregated(
--      '<BAR_PUR>'::uuid, CURRENT_DATE - 30, CURRENT_DATE, 10, 'quantity')
--    ORDER BY product_name;

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.kitchen_order_items') IS NULL THEN
    RAISE EXCEPTION 'Table kitchen_order_items absente — appliquer d''abord 20260804120000';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_top_products_aggregated'
  ) THEN
    RAISE EXCEPTION 'get_top_products_aggregated absente — rien à remplacer';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_top_products_aggregated(
  p_bar_id uuid,
  p_start_date date,
  p_end_date date,
  p_limit integer DEFAULT 10,
  p_sort_by text DEFAULT 'quantity'::text
)
RETURNS TABLE(
  product_id uuid, product_name text, product_volume text,
  transaction_count bigint, total_quantity integer, total_revenue numeric,
  total_quantity_returned integer, total_refunded numeric,
  avg_unit_price numeric, profit numeric,
  updated_at timestamp without time zone
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
#variable_conflict use_column
BEGIN
  -- 🛡️ Membre du bar, propriétaire, ou super_admin. INCHANGÉ.
  IF NOT (
    is_bar_member(p_bar_id)
    OR EXISTS (SELECT 1 FROM public.bars b WHERE b.id = p_bar_id AND b.owner_id = auth.uid())
    OR is_super_admin()
  ) THEN
    RAISE EXCEPTION 'Access denied: not a member of this bar' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH product_costs AS (
    SELECT id, current_average_cost
    FROM public.bar_products
    WHERE bar_id = p_bar_id
  ),
  -- Pre-aggregate returns per (sale_id, product_id) to prevent fanout.
  -- INCHANGÉ : un plat ne se retourne pas par ce chemin (§13.1).
  returns_agg AS (
    SELECT
      ret.sale_id      AS sale_id,
      ret.product_id   AS product_id,
      SUM(ret.quantity_returned) FILTER (
        WHERE ret.status IN ('approved', 'restocked', 'validated')
          AND (ret.is_refunded = true OR ret.reason = 'exchange')
      ) AS quantity_returned,
      SUM(ret.refund_amount) FILTER (
        WHERE ret.status IN ('approved', 'restocked', 'validated')
          AND (ret.is_refunded = true OR ret.reason = 'exchange')
      ) AS refund_amount
    FROM public.returns ret
    WHERE ret.bar_id = p_bar_id
    GROUP BY ret.sale_id, ret.product_id
  ),
  /**
   * ⭐⭐ COÛT MATIÈRE DES PLATS — pré-agrégé par (sale_id, dish_id).
   *
   * ⚠️ PRÉ-AGRÉGATION OBLIGATOIRE, même motif que `returns_agg` : joindre
   * directement multiplierait les lignes si une vente portait plusieurs
   * lignes cuisine du même plat. Le fanout gonflerait quantités ET CA.
   *
   * ⭐ `computed_cost` couvre DÉJÀ la ligne entière (mark_ready multiplie par
   * la quantité) : on somme, on ne multiplie JAMAIS par total_quantity —
   * contrairement au `cump` des boissons, qui est unitaire.
   */
  dish_costs AS (
    SELECT
      koi.sale_id                          AS sale_id,
      koi.dish_id                          AS dish_id,
      SUM(koi.computed_cost)               AS cost
    FROM public.kitchen_order_items koi
    WHERE koi.bar_id = p_bar_id
      AND koi.sale_id IS NOT NULL
    GROUP BY koi.sale_id, koi.dish_id
  ),
  aggregated_products AS (
    SELECT
      (item->>'product_id')::uuid          AS product_id,
      /**
       * ⭐⭐ CLÉ DE GROUPEMENT — `product_id` pour une boisson, `dish_id`
       * pour un plat.
       * ⚠️ Le chemin des BOISSONS est inchangé : `COALESCE` retourne
       * `product_id` dès qu'il existe, donc le regroupement, les jointures et
       * l'ordre restent identiques sur un bar pur (§3).
       * ⛔ Sans cette clé, TOUS les plats fusionnaient dans un groupe NULL.
       */
      COALESCE((item->>'product_id')::uuid, (item->>'dish_id')::uuid) AS group_key,
      MAX(item->>'product_name')           AS product_name,
      MAX(item->>'product_volume')         AS product_volume,
      COUNT(DISTINCT s.id)::BIGINT         AS transaction_count,
      (SUM((item->>'quantity')::integer) -
       COALESCE(SUM(r.quantity_returned), 0))::INT     AS total_quantity,
      (SUM((item->>'total_price')::numeric) -
       COALESCE(SUM(r.refund_amount), 0))::NUMERIC     AS total_revenue,
      COALESCE(SUM(r.quantity_returned), 0)::INT       AS total_quantity_returned,
      COALESCE(SUM(r.refund_amount), 0)::NUMERIC       AS total_refunded,
      AVG((item->>'unit_price')::numeric)              AS avg_unit_price,
      COALESCE(pc.current_average_cost, 0)::NUMERIC    AS cump,
      -- ⭐ Coût TOTAL des plats de ce groupe. NULL pour une boisson : c'est
      -- ce NULL qui fait basculer le calcul de marge plus bas.
      SUM(dc.cost)                                     AS dish_cost_total
    FROM public.sales s
    CROSS JOIN LATERAL jsonb_array_elements(s.items) AS item
    LEFT JOIN returns_agg r
      ON  r.sale_id    = s.id
      AND r.product_id = (item->>'product_id')::uuid
    LEFT JOIN product_costs pc ON pc.id = (item->>'product_id')::uuid
    -- ⚠️ Jointure sur la VENTE et le PLAT : sans `dc.sale_id = s.id`, le coût
    -- d'un plat servi ailleurs remonterait sur cette ligne.
    LEFT JOIN dish_costs dc
      ON  dc.sale_id = s.id
      AND dc.dish_id = (item->>'dish_id')::uuid
    WHERE
      s.bar_id        = p_bar_id
      AND s.status    = 'validated'
      AND s.business_date >= p_start_date
      AND s.business_date <= p_end_date
    GROUP BY
      COALESCE((item->>'product_id')::uuid, (item->>'dish_id')::uuid),
      (item->>'product_id')::uuid,
      pc.current_average_cost
  )
  SELECT
    ap.product_id,
    ap.product_name,
    ap.product_volume,
    ap.transaction_count,
    ap.total_quantity,
    ap.total_revenue,
    ap.total_quantity_returned,
    ap.total_refunded,
    ap.avg_unit_price,
    /**
     * ⭐⭐ MARGE — deux calculs selon la nature de l'article.
     *   BOISSON : revenue - (quantité × CUMP unitaire)   ← INCHANGÉ
     *   PLAT    : revenue - coût FEFO déjà total          ← NOUVEAU
     * ⛔ Avant : un plat n'ayant pas de `cump`, `COALESCE(...,0)` donnait un
     * coût NUL et l'axe « Marge » affichait 100 % sur tous les plats. Le
     * promoteur y voyait ses plats comme les plus rentables de sa carte.
     */
    CASE
      WHEN ap.dish_cost_total IS NOT NULL
        THEN (ap.total_revenue - ap.dish_cost_total)
      ELSE (ap.total_revenue - (ap.total_quantity * ap.cump))
    END                                                AS profit,
    NOW()::timestamp without time zone                 AS updated_at
  FROM aggregated_products ap
  ORDER BY
    CASE p_sort_by
      WHEN 'revenue' THEN ap.total_revenue
      WHEN 'profit'  THEN CASE
                            WHEN ap.dish_cost_total IS NOT NULL
                              THEN (ap.total_revenue - ap.dish_cost_total)
                            ELSE (ap.total_revenue - (ap.total_quantity * ap.cump))
                          END
      ELSE ap.total_quantity::numeric
    END DESC NULLS LAST
  LIMIT p_limit;
END;
$function$;

COMMENT ON FUNCTION public.get_top_products_aggregated(uuid, date, date, integer, text) IS
  'Top articles vendus sur une période. ⭐ Depuis le 05/08/2026, les PLATS y sont '
  'DISTINCTS : la clé de groupement est COALESCE(product_id, dish_id) — avant, tous '
  'fusionnaient dans un groupe NULL. ⭐ Leur marge utilise `kitchen_order_items.'
  'computed_cost` (coût FEFO figé à `ready`) et NON le CUMP de bar_products, où un '
  'plat n''existe pas — l''axe Marge affichait sinon 100 %. '
  '⚠️ INVARIANCE §3 : le chemin des boissons est inchangé, COALESCE retournant '
  'product_id dès qu''il existe.';

-- ⚠️ CREATE OR REPLACE PERD LES GRANTS sur ce projet — leçon des vagues 1-4
-- du durcissement RPC (04/07/2026). Toujours re-REVOKE/GRANT.
REVOKE ALL ON FUNCTION public.get_top_products_aggregated(uuid, date, date, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_top_products_aggregated(uuid, date, date, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_top_products_aggregated(uuid, date, date, integer, text) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL                                                         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ Fonction remplacée, sécurité intacte :
--
--    SELECT p.proname, p.prosecdef, p.proconfig
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.proname='get_top_products_aggregated';
--    -- ATTENDU : 1 ligne · true · {search_path=public,extensions}
--
-- 2) ⛔ `anon` TOUJOURS exclu (les grants sont perdus au REPLACE) :
--
--    SELECT has_function_privilege('anon',
--             'public.get_top_products_aggregated(uuid,date,date,integer,text)',
--             'EXECUTE') AS anon,
--           has_function_privilege('authenticated',
--             'public.get_top_products_aggregated(uuid,date,date,integer,text)',
--             'EXECUTE') AS auth;
--    -- ATTENDU : false | true
--
-- 3) ⭐⭐ NON-RÉGRESSION SUR UN BAR PUR — le test qui compte le plus.
--    Rejouer la requête du pré-vol 4 et comparer LIGNE PAR LIGNE :
--
--    SELECT product_name, total_quantity, total_revenue, profit
--    FROM public.get_top_products_aggregated(
--      '<BAR_PUR>'::uuid, CURRENT_DATE - 30, CURRENT_DATE, 10, 'quantity')
--    ORDER BY product_name;
--    -- ⛔ DOIT être IDENTIQUE à la photographie du pré-vol. Toute différence
--    --    signale que le chemin des boissons a bougé → ROLLBACK.
--
-- 4) ⭐ LES PLATS SONT DISTINCTS ET LEUR MARGE EST RÉELLE :
--
--    SELECT product_name, total_quantity, total_revenue, profit
--    FROM public.get_top_products_aggregated(
--      'f85ebaf5-502c-4dc9-b4ba-7e511c42e2dc'::uuid,
--      CURRENT_DATE - 2, CURRENT_DATE, 10, 'quantity');
--    -- ATTENDU : « Poulet braisé » présent, profit ≈ CA - coût FEFO
--    -- ⛔ Si profit = total_revenue, le coût des plats n'est pas joint.
--
-- 5) ⚠️ ANTI-FANOUT — la somme des quantités par plat doit correspondre :
--
--    SELECT SUM((i->>'quantity')::int) AS attendu
--    FROM public.sales s
--    CROSS JOIN LATERAL jsonb_array_elements(s.items) i
--    WHERE s.bar_id = 'f85ebaf5-502c-4dc9-b4ba-7e511c42e2dc'
--      AND s.status = 'validated'
--      AND s.business_date >= CURRENT_DATE - 2
--      AND i->>'item_type' = 'dish';
--    -- Comparer au total_quantity du plat en (4). Un écart = fanout.

-- ✅ APPLIQUEE EN PRODUCTION LE 05/08/2026.
--    Post-vols 1 a 3 certifies :
--      · SECURITY DEFINER + search_path intacts
--      · anon EXCLU (false/true) — les grants re-emis ont pris
--      · NON-REGRESSION : UNE SEULE ligne a bouge sur 7.
--
--    AVANT → APRES (bar de test, 30 jours) :
--      Awooyo Benin      266.67 →  266.67   inchange
--      Awooyo Togo      1200.00 → 1200.00   inchange
--      Beaufort (Grand) 1649.97 → 1649.97   inchange
--      Pils Togo        7000.00 → 7000.00   inchange
--      Poulet braise    7500.00 → 1500.00   ⭐ LE SEUL ECART
--      Racines          3500.00 → 3500.00   inchange
--      Whisky Cola      5500.00 → 5500.00   inchange
--
--    ⭐ 1 500 sur 7 500 de CA = 20 %, identique au bloc Rentabilite cuisine
--       et a la fiche du plat. TROIS calculs independants, le meme chiffre.
--    ⚠️ Pils Togo, Racines et Whisky Cola affichent profit = CA : leur
--       current_average_cost vaut 0 (CUMP jamais calcule, faute d appro
--       enregistre). Donnee manquante, PAS un defaut de calcul — hors
--       perimetre de cette migration.
