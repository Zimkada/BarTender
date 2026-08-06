-- ===================================================================
-- MIGRATION: pertes de LOT visibles dans les métriques cuisine
-- DATE: 2026-08-07
-- AUTHOR: AI Assistant
-- PHASE: 3B du module restauration (§8, §13.3)
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BUSINESS CONTEXT                                                │
-- └─────────────────────────────────────────────────────────────────┘

-- PROBLEM (relevé à la code review de 3B, 07/08/2026) :
--   `close_batch` écrit `discarded_qty` et `discarded_at` : la donnée est
--   stockée, datée, valorisable. Mais NI `get_kitchen_metrics` NI
--   `get_kitchen_production` ne la lisent — les deux ne regardent que
--   `kitchen_order_items`.
--
--   ⛔ Jeter 15 portions de spaghetti n'apparaissait donc NULLE PART. Ni
--   dans « Rentabilité cuisine », ni dans « Mon activité ».
--
--   ⚠️ C'est grave pour une raison précise : le régime à lot est celui où la
--   perte est LA PLUS PROBABLE — on produit d'avance, on ne vend pas tout. Et
--   la métrique du §8, « matière sortie, vente jamais née », c'est
--   exactement cela. Le module écrivait la donnée et ne la montrait pas.

-- ⭐⭐ DEUX COMPTEURS DISTINCTS, PAS UNE FUSION DANS `loss_count`
--   Les deux pertes n'appellent pas le même geste correctif :
--     · perte de PLAT (ligne annulée après `ready`) → erreur de commande,
--       client parti. Geste : revoir la prise de commande.
--     · perte de LOT (`discarded` / `expired`) → on a produit trop, ou trop
--       tôt. Geste : ajuster le VOLUME de production.
--   Les additionner masquerait lequel des deux corriger — c'est précisément
--   ce que le §13.3 reproche à un `remaining_qty = 0` sans statut.

-- ⚠️ BORNE SUR `discarded_at`, en journée commerciale — même règle que le
--   reste du module depuis la correction du 06/08 : chaque événement compte
--   le jour où il a lieu. Un lot produit lundi et jeté mercredi est une perte
--   de MERCREDI.

-- ⚠️ `expired` COMPTE COMME PERTE au même titre que `discarded` : dans les
--   deux cas la matière est sortie et rien ne sera servi. Seule la cause
--   diffère, et elle reste lisible dans `status`.

-- BREAKING_CHANGE: NO — deux clés AJOUTÉES au JSON de retour. Les clés
--   existantes gardent exactement le même sens : `loss_count` reste le
--   nombre de PLATS perdus. Aucun appelant à modifier.

-- ROLLBACK_STRATEGY:
--   Réappliquer 20260806160000 (metrics) et 20260806140000 (production).
--   ⚠️ Restaure l'invisibilité des pertes de lot.

-- FUNCTIONS_MODIFIED: get_kitchen_metrics, get_kitchen_production
-- TABLES_MODIFIED: aucune · RLS_CHANGES: aucune

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL — à exécuter AVANT, dans le SQL Editor Supabase          │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ BLOQUANT — les deux fonctions existent (on les remplace) :
--
--    SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public'
--      AND p.proname IN ('get_kitchen_metrics','get_kitchen_production')
--    ORDER BY p.proname;
--    -- ATTENDU : 2 lignes
--
-- 2) ⛔ BLOQUANT — la table des lots existe :
--
--    SELECT to_regclass('public.production_batches') AS t;
--    -- ATTENDU : non NULL. Sinon appliquer d'abord 20260807140000.
--
-- 3) ⚠️ INFORMATIF — y a-t-il des pertes de lot à révéler ?
--
--    SELECT count(*) AS lots_jetes, COALESCE(SUM(discarded_qty),0) AS portions
--    FROM public.production_batches
--    WHERE discarded_qty IS NOT NULL;
--    -- 0 attendu sur un module qui vient d'être posé.

DO $$
BEGIN
  IF to_regclass('public.production_batches') IS NULL THEN
    RAISE EXCEPTION 'production_batches absente — appliquer d''abord 20260807140000';
  END IF;
END $$;

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 1. HELPER — les pertes de lot d'une période                      │
-- └─────────────────────────────────────────────────────────────────┘
-- ⭐ Extrait en fonction parce que DEUX RPC en ont besoin, avec la même
-- règle. Dupliquer le calcul le ferait diverger — et le gérant verrait un
-- chiffre différent du cuisinier sur la même journée.

CREATE OR REPLACE FUNCTION public.get_batch_losses(
  p_bar_id UUID,
  p_start  DATE,
  p_end    DATE
)
RETURNS TABLE (loss_qty NUMERIC, loss_cost NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_close INTEGER;
BEGIN
  SELECT COALESCE(closing_hour, 6) INTO v_close FROM public.bars WHERE id = p_bar_id;
  v_close := COALESCE(v_close, 6);

  RETURN QUERY
  SELECT
    COALESCE(SUM(pb.discarded_qty), 0)::NUMERIC,
    COALESCE(SUM(pb.discarded_qty * pb.unit_cost), 0)::NUMERIC
  FROM public.production_batches pb
  WHERE pb.bar_id = p_bar_id
    AND pb.discarded_qty IS NOT NULL
    AND pb.discarded_at IS NOT NULL
    -- ⚠️ Borne sur `discarded_at` : un lot produit lundi et jeté mercredi est
    -- une perte de MERCREDI. Même règle que partout depuis le 06/08.
    AND DATE((pb.discarded_at AT TIME ZONE 'Africa/Porto-Novo')
             - (v_close || ' hours')::INTERVAL) BETWEEN p_start AND p_end;
END;
$$;

-- ⛔ PAS DE GRANT À `authenticated` — helper interne, SECURITY DEFINER SANS
-- contrôle d'appartenance au bar. Les deux RPC appelantes le vérifient déjà
-- avant de l'invoquer ; l'exposer permettrait de lire les pertes d'un AUTRE
-- bar. Même raisonnement que `derive_dish_production_mode`.
REVOKE ALL ON FUNCTION public.get_batch_losses(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_batch_losses(UUID, DATE, DATE) TO service_role;

COMMENT ON FUNCTION public.get_batch_losses(UUID, DATE, DATE) IS
  '§8 — pertes de LOT d''une période (portions jetées ou périmées, et leur coût). '
  'Bornée sur discarded_at en journée commerciale. SOURCE UNIQUE partagée par '
  'get_kitchen_metrics et get_kitchen_production : dupliquer le calcul ferait diverger le '
  'chiffre du gérant de celui du cuisinier. '
  '⛔ Helper INTERNE, non exposé au client : SECURITY DEFINER sans contrôle de bar.';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 2. get_kitchen_metrics — + batch_loss_count / batch_loss_cost    │
-- └─────────────────────────────────────────────────────────────────┘
-- ⚠️ SEUL LE BLOC DE RETOUR CHANGE. Tout le corps est repris à l'identique de
-- 20260806160000 : bornes sur sales.business_date, LEFT JOIN sales, filtres
-- par FILTER. Ne rien y toucher d'autre.

CREATE OR REPLACE FUNCTION public.get_kitchen_metrics(
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
  v_dishes  JSONB;
  v_bloss   RECORD;
BEGIN
  IF NOT (is_bar_member(p_bar_id) OR is_super_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accès refusé à ce bar');
  END IF;

  SELECT COALESCE(closing_hour, 6) INTO v_close
  FROM public.bars WHERE id = p_bar_id;
  v_close := COALESCE(v_close, 6);

  v_end   := COALESCE(p_end_date, CURRENT_DATE);
  v_start := COALESCE(p_start_date, v_end - 30);

  IF v_start > v_end THEN
    RETURN jsonb_build_object('success', false, 'error', 'Période invalide : début après fin');
  END IF;

  SELECT
    COALESCE(SUM(koi.quantity) FILTER (
      WHERE koi.status = 'served' AND s.business_date BETWEEN v_start AND v_end
    ), 0) AS served_count,

    COALESCE(SUM(koi.unit_price * koi.quantity) FILTER (
      WHERE koi.status = 'served' AND s.business_date BETWEEN v_start AND v_end
    ), 0) AS revenue,
    COALESCE(SUM(koi.computed_cost) FILTER (
      WHERE koi.status = 'served' AND s.business_date BETWEEN v_start AND v_end
    ), 0) AS cost,

    COALESCE(SUM(koi.quantity) FILTER (
      WHERE koi.consumed_at IS NOT NULL AND koi.sale_id IS NULL
        AND koi.status = 'cancelled'
        AND DATE((koi.consumed_at AT TIME ZONE 'Africa/Porto-Novo')
                 - (v_close || ' hours')::INTERVAL) BETWEEN v_start AND v_end
    ), 0) AS loss_count,
    COALESCE(SUM(koi.computed_cost) FILTER (
      WHERE koi.consumed_at IS NOT NULL AND koi.sale_id IS NULL
        AND koi.status = 'cancelled'
        AND DATE((koi.consumed_at AT TIME ZONE 'Africa/Porto-Novo')
                 - (v_close || ' hours')::INTERVAL) BETWEEN v_start AND v_end
    ), 0) AS loss_cost,

    COALESCE(SUM(koi.quantity) FILTER (WHERE koi.status = 'ready'), 0) AS pending_count,
    COALESCE(SUM(koi.computed_cost) FILTER (WHERE koi.status = 'ready'), 0) AS pending_cost,

    AVG(EXTRACT(EPOCH FROM (koi.ready_at - koi.created_at)) / 60) FILTER (
      WHERE koi.ready_at IS NOT NULL
        AND DATE((koi.ready_at AT TIME ZONE 'Africa/Porto-Novo')
                 - (v_close || ' hours')::INTERVAL) BETWEEN v_start AND v_end
    ) AS avg_prep_min
  INTO v_totals
  FROM public.kitchen_order_items koi
  LEFT JOIN public.sales s ON s.id = koi.sale_id
  WHERE koi.bar_id = p_bar_id
    AND (
         (s.business_date BETWEEN (v_start - 1) AND (v_end + 1))
      OR (koi.consumed_at >= (v_start - 1)::TIMESTAMPTZ
      AND koi.consumed_at <  (v_end + 2)::TIMESTAMPTZ)
      OR (koi.ready_at    >= (v_start - 1)::TIMESTAMPTZ
      AND koi.ready_at    <  (v_end + 2)::TIMESTAMPTZ)
      OR (koi.created_at  >= (v_start - 1)::TIMESTAMPTZ
      AND koi.created_at  <  (v_end + 2)::TIMESTAMPTZ)
      OR koi.status IN ('pending','accepted','preparing','ready')
    );

  -- ⭐ LES PERTES DE LOT — délégué au helper, source unique.
  SELECT * INTO v_bloss FROM public.get_batch_losses(p_bar_id, v_start, v_end);

  SELECT COALESCE(
           jsonb_agg(row_to_json(t)::JSONB
                     ORDER BY (t.sold_count > 0) DESC, t.margin DESC),
           '[]'::JSONB)
  INTO v_dishes
  FROM (
    SELECT
      d.id                                                  AS dish_id,
      d.name                                                AS dish_name,
      COALESCE(SUM(koi.quantity) FILTER (
        WHERE koi.status = 'served' AND s.business_date BETWEEN v_start AND v_end
      ), 0)                                                 AS sold_count,
      COALESCE(SUM(koi.unit_price * koi.quantity) FILTER (
        WHERE koi.status = 'served' AND s.business_date BETWEEN v_start AND v_end
      ), 0)                                                 AS revenue,
      COALESCE(SUM(koi.computed_cost) FILTER (
        WHERE koi.status = 'served' AND s.business_date BETWEEN v_start AND v_end
      ), 0)                                                 AS cost,
      COALESCE(SUM(koi.unit_price * koi.quantity - COALESCE(koi.computed_cost, 0)) FILTER (
        WHERE koi.status = 'served' AND s.business_date BETWEEN v_start AND v_end
      ), 0)                                                 AS margin,

      CASE
        WHEN COALESCE(SUM(koi.unit_price * koi.quantity) FILTER (
               WHERE koi.status = 'served' AND s.business_date BETWEEN v_start AND v_end
             ), 0) > 0
        THEN ROUND(
          (SUM(koi.unit_price * koi.quantity - COALESCE(koi.computed_cost, 0)) FILTER (
             WHERE koi.status = 'served' AND s.business_date BETWEEN v_start AND v_end))
          / SUM(koi.unit_price * koi.quantity) FILTER (
             WHERE koi.status = 'served' AND s.business_date BETWEEN v_start AND v_end) * 100, 1)
        ELSE NULL
      END                                                    AS margin_rate,

      COALESCE(SUM(koi.quantity) FILTER (
        WHERE koi.consumed_at IS NOT NULL AND koi.sale_id IS NULL
          AND koi.status = 'cancelled'
          AND DATE((koi.consumed_at AT TIME ZONE 'Africa/Porto-Novo')
                   - (v_close || ' hours')::INTERVAL) BETWEEN v_start AND v_end
      ), 0)                                                  AS loss_count,
      COALESCE(SUM(koi.computed_cost) FILTER (
        WHERE koi.consumed_at IS NOT NULL AND koi.sale_id IS NULL
          AND koi.status = 'cancelled'
          AND DATE((koi.consumed_at AT TIME ZONE 'Africa/Porto-Novo')
                   - (v_close || ' hours')::INTERVAL) BETWEEN v_start AND v_end
      ), 0)                                                  AS loss_cost,

      ROUND(AVG(EXTRACT(EPOCH FROM (koi.ready_at - koi.created_at)) / 60) FILTER (
        WHERE koi.ready_at IS NOT NULL
          AND DATE((koi.ready_at AT TIME ZONE 'Africa/Porto-Novo')
                   - (v_close || ' hours')::INTERVAL) BETWEEN v_start AND v_end
      )::NUMERIC, 1)                                         AS avg_prep_min
    FROM public.kitchen_order_items koi
    LEFT JOIN public.sales s ON s.id = koi.sale_id
    JOIN public.dishes d
      ON d.id = koi.dish_id
     AND d.bar_id = p_bar_id
    WHERE koi.bar_id = p_bar_id
      AND (
           (s.business_date BETWEEN (v_start - 1) AND (v_end + 1))
        OR (koi.consumed_at >= (v_start - 1)::TIMESTAMPTZ
        AND koi.consumed_at <  (v_end + 2)::TIMESTAMPTZ)
        OR (koi.ready_at    >= (v_start - 1)::TIMESTAMPTZ
        AND koi.ready_at    <  (v_end + 2)::TIMESTAMPTZ)
      )
    GROUP BY d.id, d.name
    HAVING COALESCE(SUM(koi.quantity) FILTER (
             WHERE koi.status = 'served' AND s.business_date BETWEEN v_start AND v_end
           ), 0) > 0
        OR COALESCE(SUM(koi.quantity) FILTER (
             WHERE koi.consumed_at IS NOT NULL AND koi.sale_id IS NULL
               AND koi.status = 'cancelled'
               AND DATE((koi.consumed_at AT TIME ZONE 'Africa/Porto-Novo')
                        - (v_close || ' hours')::INTERVAL) BETWEEN v_start AND v_end
           ), 0) > 0
  ) t;

  RETURN jsonb_build_object(
    'success',        true,
    'start_date',     v_start,
    'end_date',       v_end,
    'served_count',   COALESCE(v_totals.served_count, 0),
    'revenue',        ROUND(COALESCE(v_totals.revenue, 0), 2),
    'cost',           ROUND(COALESCE(v_totals.cost, 0), 2),
    'margin',         ROUND(COALESCE(v_totals.revenue, 0) - COALESCE(v_totals.cost, 0), 2),
    'margin_rate',    CASE
                        WHEN COALESCE(v_totals.revenue, 0) > 0
                        THEN ROUND((COALESCE(v_totals.revenue, 0) - COALESCE(v_totals.cost, 0))
                                   / v_totals.revenue * 100, 1)
                        ELSE NULL
                      END,
    -- ⚠️ SENS INCHANGÉ : `loss_count` reste le nombre de PLATS perdus.
    'loss_count',     COALESCE(v_totals.loss_count, 0),
    'loss_cost',      ROUND(COALESCE(v_totals.loss_cost, 0), 2),
    -- ⭐ NOUVEAU — les pertes de LOT, distinctes. Fusionner les deux
    -- masquerait lequel des deux gestes correctifs appliquer : revoir la
    -- prise de commande, ou ajuster le volume de production.
    'batch_loss_count', COALESCE(v_bloss.loss_qty, 0),
    'batch_loss_cost',  ROUND(COALESCE(v_bloss.loss_cost, 0), 2),
    'pending_count',  COALESCE(v_totals.pending_count, 0),
    'pending_cost',   ROUND(COALESCE(v_totals.pending_cost, 0), 2),
    'avg_prep_min',   ROUND(v_totals.avg_prep_min::NUMERIC, 1),
    'dishes',         v_dishes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_kitchen_metrics(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_kitchen_metrics(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_kitchen_metrics(UUID, DATE, DATE) TO service_role;

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 3. get_kitchen_production — + batch_loss_count (SANS montant)    │
-- └─────────────────────────────────────────────────────────────────┘
-- ⛔⛔ AUCUN MONTANT ICI. C'est la propriété qui justifie l'existence de
-- cette RPC : le cuisinier voit les QUANTITÉS, pas les montants (§8). On
-- expose donc `batch_loss_count` et JAMAIS `batch_loss_cost`.

CREATE OR REPLACE FUNCTION public.get_kitchen_production(
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
  v_dishes  JSONB;
  v_bloss   RECORD;
BEGIN
  IF NOT (is_bar_member(p_bar_id) OR is_super_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accès refusé à ce bar');
  END IF;

  SELECT COALESCE(closing_hour, 6) INTO v_close FROM public.bars WHERE id = p_bar_id;
  v_close := COALESCE(v_close, 6);

  v_end   := COALESCE(p_end_date, CURRENT_DATE);
  v_start := COALESCE(p_start_date, v_end - 30);

  IF v_start > v_end THEN
    RETURN jsonb_build_object('success', false, 'error', 'Période invalide : début après fin');
  END IF;

  SELECT
    COALESCE(SUM(koi.quantity) FILTER (
      WHERE koi.status = 'served'
        AND koi.served_at IS NOT NULL
        AND DATE((koi.served_at AT TIME ZONE 'Africa/Porto-Novo')
                 - (v_close || ' hours')::INTERVAL) BETWEEN v_start AND v_end
    ), 0) AS served_count,

    COALESCE(SUM(koi.quantity) FILTER (
      WHERE koi.consumed_at IS NOT NULL
        AND koi.sale_id IS NULL
        AND koi.status = 'cancelled'
        AND DATE((koi.consumed_at AT TIME ZONE 'Africa/Porto-Novo')
                 - (v_close || ' hours')::INTERVAL) BETWEEN v_start AND v_end
    ), 0) AS loss_count,

    COALESCE(SUM(koi.quantity) FILTER (WHERE koi.status = 'ready'), 0) AS pending_count,

    COALESCE(SUM(koi.quantity) FILTER (WHERE koi.status IN
                       ('pending','accepted','preparing')), 0)          AS todo_count,

    ROUND(AVG(EXTRACT(EPOCH FROM (koi.ready_at - koi.created_at)) / 60) FILTER (
      WHERE koi.ready_at IS NOT NULL
        AND DATE((koi.ready_at AT TIME ZONE 'Africa/Porto-Novo')
                 - (v_close || ' hours')::INTERVAL) BETWEEN v_start AND v_end
    )::NUMERIC, 1) AS avg_prep_min
  INTO v_totals
  FROM public.kitchen_order_items koi
  WHERE koi.bar_id = p_bar_id
    AND (
         (koi.created_at  >= (v_start - 1)::TIMESTAMPTZ
      AND koi.created_at  <  (v_end + 2)::TIMESTAMPTZ)
      OR (koi.served_at   >= (v_start - 1)::TIMESTAMPTZ
      AND koi.served_at   <  (v_end + 2)::TIMESTAMPTZ)
      OR (koi.consumed_at >= (v_start - 1)::TIMESTAMPTZ
      AND koi.consumed_at <  (v_end + 2)::TIMESTAMPTZ)
      OR (koi.ready_at    >= (v_start - 1)::TIMESTAMPTZ
      AND koi.ready_at    <  (v_end + 2)::TIMESTAMPTZ)
      OR koi.status IN ('pending','accepted','preparing','ready')
    );

  -- ⭐ Pertes de lot — MÊME helper que le gérant : un seul chiffre.
  SELECT * INTO v_bloss FROM public.get_batch_losses(p_bar_id, v_start, v_end);

  SELECT COALESCE(
           jsonb_agg(row_to_json(t)::JSONB
                     ORDER BY t.loss_count DESC, t.served_count DESC),
           '[]'::JSONB)
  INTO v_dishes
  FROM (
    SELECT
      d.id                                                  AS dish_id,
      d.name                                                AS dish_name,
      COALESCE(SUM(koi.quantity)
               FILTER (WHERE koi.status = 'served'), 0)      AS served_count,
      COALESCE(SUM(koi.quantity)
               FILTER (WHERE koi.consumed_at IS NOT NULL
                         AND koi.sale_id IS NULL
                         AND koi.status = 'cancelled'), 0)   AS loss_count,
      ROUND(AVG(EXTRACT(EPOCH FROM (koi.ready_at - koi.created_at)) / 60)
            FILTER (WHERE koi.ready_at IS NOT NULL)::NUMERIC, 1) AS avg_prep_min
    FROM public.kitchen_order_items koi
    JOIN public.dishes d ON d.id = koi.dish_id
    WHERE koi.bar_id = p_bar_id
      AND (
           (koi.served_at   >= (v_start - 1)::TIMESTAMPTZ
        AND koi.served_at   <  (v_end + 2)::TIMESTAMPTZ)
        OR (koi.consumed_at >= (v_start - 1)::TIMESTAMPTZ
        AND koi.consumed_at <  (v_end + 2)::TIMESTAMPTZ)
        OR (koi.ready_at    >= (v_start - 1)::TIMESTAMPTZ
        AND koi.ready_at    <  (v_end + 2)::TIMESTAMPTZ)
      )
    GROUP BY d.id, d.name
    HAVING COALESCE(SUM(koi.quantity)
                    FILTER (WHERE koi.status = 'served'), 0) > 0
        OR COALESCE(SUM(koi.quantity)
                    FILTER (WHERE koi.consumed_at IS NOT NULL
                              AND koi.sale_id IS NULL
                              AND koi.status = 'cancelled'), 0) > 0
  ) t;

  RETURN jsonb_build_object(
    'success',       true,
    'start_date',    v_start,
    'end_date',      v_end,
    'served_count',  COALESCE(v_totals.served_count, 0),
    'loss_count',    COALESCE(v_totals.loss_count, 0),
    -- ⭐ NOUVEAU — portions de lot jetées. QUANTITÉ SEULE : `batch_loss_cost`
    -- est VOLONTAIREMENT absent, le cuisinier n'a pas droit aux montants.
    'batch_loss_count', COALESCE(v_bloss.loss_qty, 0),
    'pending_count', COALESCE(v_totals.pending_count, 0),
    'todo_count',    COALESCE(v_totals.todo_count, 0),
    'avg_prep_min',  v_totals.avg_prep_min,
    'dishes',        COALESCE(v_dishes, '[]'::JSONB)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_kitchen_production(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_kitchen_production(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_kitchen_production(UUID, DATE, DATE) TO service_role;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL — à exécuter APRÈS, dans le SQL Editor Supabase         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ BLOQUANT — les 3 fonctions, SECURITY DEFINER, search_path figé :
--
--    SELECT p.proname, p.prosecdef AS security_definer, p.proconfig
--    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public'
--      AND p.proname IN ('get_batch_losses','get_kitchen_metrics','get_kitchen_production')
--    ORDER BY p.proname;
--    -- ATTENDU : 3 lignes | true | {search_path=public}
--
-- 2) ⛔⛔ BLOQUANT — GRANTS. Le helper NE doit PAS être exposé :
--
--    SELECT has_function_privilege('authenticated',
--             'public.get_kitchen_metrics(UUID,DATE,DATE)','EXECUTE')    AS auth_metrics,
--           has_function_privilege('authenticated',
--             'public.get_kitchen_production(UUID,DATE,DATE)','EXECUTE') AS auth_production,
--           has_function_privilege('authenticated',
--             'public.get_batch_losses(UUID,DATE,DATE)','EXECUTE')       AS auth_helper_KO;
--    -- ATTENDU : true | true | false
--
-- 3) ⛔⛔⛔ BLOQUANT — TOUJOURS AUCUN MONTANT dans la RPC du cuisinier :
--
--    SELECT pg_get_functiondef(p.oid) ~* '(unit_price|computed_cost|revenue|margin|loss_cost)'
--             AS contient_des_montants
--    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname='get_kitchen_production';
--    -- ATTENDU : false
--    -- ⛔ Si true : un montant a été réintroduit, il fuirait vers le cuisinier.
--
-- 4) ⛔ BLOQUANT — le LEFT JOIN de get_kitchen_metrics est préservé (sans lui
--    TOUTES les pertes de plat disparaissent) :
--
--    SELECT pg_get_functiondef(p.oid) ~ 'LEFT JOIN public\.sales' AS left_join_present
--    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname='get_kitchen_metrics';
--    -- ATTENDU : true
--
-- 5) ⚠️ FONCTIONNEL — via l'application :
--    -- a) jeter un lot avec du reste, puis ouvrir « Rentabilité cuisine » :
--    --    les portions jetées et leur coût apparaissent, SÉPARÉMENT des
--    --    pertes de plats ;
--    -- b) « Mon activité » côté cuisinier : les portions apparaissent, le
--    --    COÛT non.
