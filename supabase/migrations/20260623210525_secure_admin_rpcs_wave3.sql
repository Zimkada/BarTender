-- =====================================================
-- SÉCURITÉ — Vague 3 : guards sur les RPC de stats scopées bar_id
-- =====================================================
-- Date : 2026-06-23
-- Suite des Vagues 1 (20260623190359) et 2 (20260623203318). Même fait racine :
--   owner = postgres → SECURITY DEFINER bypasse la RLS, donc « let RLS handle it »
--   est faux. Ces 5 RPC prennent un p_bar_id en paramètre et n'avaient AUCUN guard
--   → un authentifié (gérant/serveur d'un autre bar) pouvait lire les stats /
--   le top produits / les marges de promo de N'IMPORTE quel bar en devinant son UUID.
--   Fuite cross-bar entre authentifiés (moins grave que les fuites anon des Vagues
--   1-2, mais réelle).
--
-- Guard appliqué : is_bar_member(p_bar_id) OR <owner du bar> OR is_super_admin().
--   - is_bar_member  → gérant / serveur / promoteur (le promoteur EST inséré dans
--                      bar_members par setup_promoter_bar, vérifié).
--   - owner          → filet pour un éventuel bar legacy dont l'owner ne serait pas
--                      (ou plus) dans bar_members. Cohérent avec le guard de
--                      get_bar_members (Vague 1).
--   - is_super_admin → le flux admin « cliquer sur un bar » (get_bar_admin_stats via
--                      BarsService.getBarStats) lit des bars dont l'admin n'est pas
--                      membre. Indispensable pour ne pas casser ce flux.
--
-- Principe (idem Vagues 1-2) : recréation À L'IDENTIQUE du corps canonique le plus
--   récent de chaque fonction, seul le guard est ajouté en tête. Zéro changement de
--   comportement pour l'usage légitime.
--
-- Bodies canoniques repris :
--   get_bar_admin_stats                          → 20251221_create_get_bar_admin_stats_rpc
--   get_top_products_aggregated                  → 20260505000000_fix_top_products_fanout_bug
--   get_top_products_by_server                   → 20260223180000_fix_simplified_mode_rls_and_rpc
--   get_bar_global_promotion_stats_with_profit   → 20260105_fix_promotion_profit_roi_calculation
--   get_bar_promotion_stats_with_profit          → 20260105_fix_promotion_profit_roi_calculation
--
-- Les fonctions SQL pures (LANGUAGE sql) ne peuvent pas porter un IF/RAISE : on les
--   convertit en plpgsql (corps identique enveloppé dans RETURN QUERY) pour pouvoir
--   ajouter le guard. Signatures, types de retour ET attributs (STABLE / PARALLEL SAFE /
--   search_path) repris à l'identique de l'ÉTAT PROD réel (vérifié par pg_proc :
--   les 5 fonctions ont `SET search_path = public, extensions` → conservé sur les 5).
--
-- Conversion sql → plpgsql : nécessite `#variable_conflict use_column` sur les 2
--   fonctions top_products. En plpgsql, les colonnes du RETURNS TABLE (product_id,
--   product_name, product_volume) deviennent des variables implicites → toute
--   référence non qualifiée à ces noms dans le corps lève l'erreur 42702
--   "column reference ... is ambiguous" (absente en LANGUAGE sql). La directive
--   résout le conflit en faveur de la colonne, reproduisant le comportement SQL.
--   Le ORDER BY CASE caste la branche en ::numeric (coercition que SQL faisait déjà).
-- =====================================================

BEGIN;

-- =====================================================
-- 1. get_bar_admin_stats — guard membre/owner/super_admin
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_bar_admin_stats(p_bar_id uuid)
RETURNS TABLE (
  total_products bigint,
  total_sales bigint,
  total_revenue numeric,
  pending_sales bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
PARALLEL SAFE
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  -- 🛡️ Membre du bar, propriétaire, ou super_admin (flux admin "cliquer sur un bar").
  IF NOT (
    is_bar_member(p_bar_id)
    OR EXISTS (SELECT 1 FROM public.bars b WHERE b.id = p_bar_id AND b.owner_id = auth.uid())
    OR is_super_admin()
  ) THEN
    RAISE EXCEPTION 'Access denied: not a member of this bar' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    -- Count active products
    (SELECT COUNT(*)::bigint FROM public.bar_products WHERE bar_id = p_bar_id AND is_active = true) as total_products,
    -- Count validated sales
    (SELECT COUNT(*)::bigint FROM public.sales WHERE bar_id = p_bar_id AND status = 'validated') as total_sales,
    -- Sum revenue from validated sales
    (SELECT COALESCE(SUM(total), 0)::numeric FROM public.sales WHERE bar_id = p_bar_id AND status = 'validated') as total_revenue,
    -- Count pending sales
    (SELECT COUNT(*)::bigint FROM public.sales WHERE bar_id = p_bar_id AND status = 'pending') as pending_sales;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_bar_admin_stats(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_bar_admin_stats(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_bar_admin_stats(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_bar_admin_stats(uuid) IS
'Bar admin statistics. Guard membre/owner/super_admin ajouté 2026-06-23 (Vague 3).';

-- =====================================================
-- 2. get_top_products_aggregated — guard membre/owner/super_admin
-- =====================================================
-- Corps canonique de 20260505000000 (fix fanout). Converti sql → plpgsql pour le guard.
CREATE OR REPLACE FUNCTION public.get_top_products_aggregated(
    p_bar_id uuid,
    p_start_date date,
    p_end_date date,
    p_limit integer DEFAULT 10,
    p_sort_by text DEFAULT 'quantity'::text
)
RETURNS TABLE(
    product_id              uuid,
    product_name            text,
    product_volume          text,
    transaction_count       bigint,
    total_quantity          integer,
    total_revenue           numeric,
    total_quantity_returned integer,
    total_refunded          numeric,
    avg_unit_price          numeric,
    profit                  numeric,
    updated_at              timestamp without time zone
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
#variable_conflict use_column
BEGIN
  -- En plpgsql, les colonnes du RETURNS TABLE (product_id, ...) deviennent des
  -- variables implicites. La directive ci-dessus résout les conflits en faveur de
  -- la COLONNE (comportement du LANGUAGE sql d'origine) → évite l'erreur 42702
  -- "column reference product_id is ambiguous".
  -- 🛡️ Membre du bar, propriétaire, ou super_admin.
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
  -- Pre-aggregate returns per (sale_id, product_id) to prevent fanout:
  -- without this, a sale joined to N return rows would multiply SUM(quantity) by N.
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
  aggregated_products AS (
    SELECT
      (item->>'product_id')::uuid          AS product_id,
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
      COALESCE(pc.current_average_cost, 0)::NUMERIC    AS cump
    FROM public.sales s
    CROSS JOIN LATERAL jsonb_array_elements(s.items) AS item
    LEFT JOIN returns_agg r
      ON  r.sale_id    = s.id
      AND r.product_id = (item->>'product_id')::uuid
    LEFT JOIN product_costs pc ON pc.id = (item->>'product_id')::uuid
    WHERE
      s.bar_id        = p_bar_id
      AND s.status    = 'validated'
      AND s.business_date >= p_start_date
      AND s.business_date <= p_end_date
    GROUP BY
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
    (ap.total_revenue - (ap.total_quantity * ap.cump)) AS profit,
    -- ::timestamp without time zone : le RETURNS TABLE déclare ce type (canon 20260505).
    -- En LANGUAGE sql la coercition NOW()→sans-tz était implicite ; en plpgsql RETURN
    -- QUERY le typage est strict → cast explicite requis (sinon erreur 42804).
    NOW()::timestamp without time zone                 AS updated_at
  FROM aggregated_products ap
  ORDER BY
    CASE p_sort_by
      WHEN 'revenue' THEN ap.total_revenue
      WHEN 'profit'  THEN (ap.total_revenue - (ap.total_quantity * ap.cump))
      ELSE ap.total_quantity::numeric
    END DESC NULLS LAST
  LIMIT p_limit;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_top_products_aggregated(uuid, date, date, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_top_products_aggregated(uuid, date, date, integer, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_top_products_aggregated(uuid, date, date, integer, text) TO authenticated;

COMMENT ON FUNCTION public.get_top_products_aggregated(uuid, date, date, integer, text) IS
'Top produits agrégés. Guard membre/owner/super_admin ajouté 2026-06-23 (Vague 3).';

-- =====================================================
-- 3. get_top_products_by_server — guard membre/owner/super_admin
-- =====================================================
-- Corps canonique de 20260223180000 (business_date). Converti sql → plpgsql pour le guard.
CREATE OR REPLACE FUNCTION public.get_top_products_by_server(
    p_bar_id UUID,
    p_start_date TEXT,
    p_end_date TEXT,
    p_server_id UUID DEFAULT NULL,
    p_limit INT DEFAULT 10,
    p_sort_by TEXT DEFAULT 'quantity'
)
RETURNS TABLE (
    product_id UUID,
    product_name TEXT,
    product_volume TEXT,
    transaction_count BIGINT,
    total_quantity INT,
    total_revenue NUMERIC,
    total_quantity_returned INT,
    total_refunded NUMERIC,
    avg_unit_price NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public', 'extensions'
AS $$
#variable_conflict use_column
BEGIN
  -- Résout product_id/product_name/product_volume (colonnes RETURNS TABLE devenues
  -- variables en plpgsql) en faveur de la COLONNE → évite l'erreur 42702 ambiguous.
  -- 🛡️ Membre du bar, propriétaire, ou super_admin.
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
    FROM bar_products
    WHERE bar_id = p_bar_id
  ),
  aggregated_products AS (
    SELECT
      (item->>'product_id')::uuid AS product_id,
      item->>'product_name' AS product_name,
      item->>'product_volume' AS product_volume,
      COUNT(DISTINCT s.id)::BIGINT AS transaction_count,
      (SUM((item->>'quantity')::integer) -
       COALESCE(SUM(r.quantity_returned) FILTER (WHERE r.status IN ('approved', 'restocked') AND r.is_refunded = true), 0))::INT AS total_quantity,
      (SUM((item->>'total_price')::numeric) -
       COALESCE(SUM(r.refund_amount) FILTER (WHERE r.status IN ('approved', 'restocked') AND r.is_refunded = true), 0))::NUMERIC AS total_revenue,
      COALESCE(SUM(r.quantity_returned) FILTER (WHERE r.status IN ('approved', 'restocked') AND r.is_refunded = true), 0)::INT AS total_quantity_returned,
      COALESCE(SUM(r.refund_amount) FILTER (WHERE r.status IN ('approved', 'restocked') AND r.is_refunded = true), 0)::NUMERIC AS total_refunded,
      AVG((item->>'unit_price')::numeric) AS avg_unit_price
    FROM sales s
    CROSS JOIN LATERAL jsonb_array_elements(s.items) AS item
    LEFT JOIN returns r ON r.sale_id = s.id
      AND r.product_id = (item->>'product_id')::uuid
    LEFT JOIN product_costs pc ON pc.id = (item->>'product_id')::uuid
    WHERE
      s.bar_id = p_bar_id
      AND s.status = 'validated'
      -- ✨ BUG FIX #5: Use the business_date column instead of hardcoded 6h interval
      AND s.business_date >= p_start_date::DATE
      AND s.business_date <= p_end_date::DATE
      AND (p_server_id IS NULL OR s.server_id = p_server_id OR s.sold_by = p_server_id)
    GROUP BY
      (item->>'product_id')::uuid,
      item->>'product_name',
      item->>'product_volume'
  )
  SELECT
    aggregated_products.product_id,
    aggregated_products.product_name,
    aggregated_products.product_volume,
    aggregated_products.transaction_count,
    aggregated_products.total_quantity,
    aggregated_products.total_revenue,
    aggregated_products.total_quantity_returned,
    aggregated_products.total_refunded,
    aggregated_products.avg_unit_price
  FROM aggregated_products
  ORDER BY
    CASE p_sort_by
      WHEN 'revenue' THEN aggregated_products.total_revenue
      ELSE aggregated_products.total_quantity::numeric
    END DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_top_products_by_server(UUID, TEXT, TEXT, UUID, INT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_top_products_by_server(UUID, TEXT, TEXT, UUID, INT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_top_products_by_server(UUID, TEXT, TEXT, UUID, INT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.get_top_products_by_server(UUID, TEXT, TEXT, UUID, INT, TEXT) IS
'Top produits par serveur (business_date). Guard membre/owner/super_admin ajouté 2026-06-23 (Vague 3).';

-- =====================================================
-- 4. get_bar_global_promotion_stats_with_profit — guard membre/owner/super_admin
-- =====================================================
-- Corps canonique de 20260105. plpgsql d'origine, on insère seulement le guard.
CREATE OR REPLACE FUNCTION get_bar_global_promotion_stats_with_profit(
  p_bar_id UUID,
  p_start_date TEXT DEFAULT NULL,
  p_end_date TEXT DEFAULT NULL
)
RETURNS TABLE (
  total_revenue DECIMAL,
  total_discount DECIMAL,
  total_applications BIGINT,
  total_cost_of_goods DECIMAL,
  net_profit DECIMAL,
  margin_percentage NUMERIC,
  roi_percentage NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  -- 🛡️ Membre du bar, propriétaire, ou super_admin.
  IF NOT (
    is_bar_member(p_bar_id)
    OR EXISTS (SELECT 1 FROM public.bars b WHERE b.id = p_bar_id AND b.owner_id = auth.uid())
    OR is_super_admin()
  ) THEN
    RAISE EXCEPTION 'Access denied: not a member of this bar' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(SUM(pa.discounted_price), 0)::DECIMAL as total_revenue,
    COALESCE(SUM(pa.discount_amount), 0)::DECIMAL as total_discount,
    COUNT(*)::BIGINT as total_applications,
    COALESCE(SUM(pa.product_cost_total), 0)::DECIMAL as total_cost_of_goods,
    -- Net Profit = Revenue - COGS
    (COALESCE(SUM(pa.discounted_price), 0) - COALESCE(SUM(pa.product_cost_total), 0))::DECIMAL as net_profit,
    -- Marge = (Revenue - COGS) / Revenue × 100
    CASE
        WHEN COALESCE(SUM(pa.discounted_price), 0) > 0
        THEN ROUND(((COALESCE(SUM(pa.discounted_price), 0) - COALESCE(SUM(pa.product_cost_total), 0)) / COALESCE(SUM(pa.discounted_price), 0) * 100)::NUMERIC, 2)
        ELSE 0
    END::NUMERIC as margin_percentage,
    -- ROI = (Net Profit / COGS) × 100
    CASE
        WHEN COALESCE(SUM(pa.product_cost_total), 0) > 0
        THEN ROUND(((COALESCE(SUM(pa.discounted_price), 0) - COALESCE(SUM(pa.product_cost_total), 0)) / COALESCE(SUM(pa.product_cost_total), 0) * 100)::NUMERIC, 2)
        ELSE 0
    END::NUMERIC as roi_percentage
  FROM promotion_applications pa
  WHERE pa.bar_id = p_bar_id
  AND (p_start_date IS NULL OR pa.applied_at >= p_start_date::TIMESTAMP)
  AND (p_end_date IS NULL OR pa.applied_at <= p_end_date::TIMESTAMP);
END;
$$;

REVOKE EXECUTE ON FUNCTION get_bar_global_promotion_stats_with_profit(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_bar_global_promotion_stats_with_profit(UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION get_bar_global_promotion_stats_with_profit(UUID, TEXT, TEXT) TO authenticated;
-- service_role conservé (cf. grant d'origine 20260105).
GRANT EXECUTE ON FUNCTION get_bar_global_promotion_stats_with_profit(UUID, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION get_bar_global_promotion_stats_with_profit(UUID, TEXT, TEXT) IS
'Stats globales promotions avec profit. Guard membre/owner/super_admin ajouté 2026-06-23 (Vague 3).';

-- =====================================================
-- 5. get_bar_promotion_stats_with_profit — guard membre/owner/super_admin
-- =====================================================
-- Corps canonique de 20260105. plpgsql d'origine, on insère seulement le guard.
CREATE OR REPLACE FUNCTION get_bar_promotion_stats_with_profit(
  p_bar_id UUID,
  p_start_date TEXT DEFAULT NULL,
  p_end_date TEXT DEFAULT NULL
)
RETURNS TABLE (
  promotion_id UUID,
  promotion_name TEXT,
  total_applications BIGINT,
  total_revenue DECIMAL,
  total_discount DECIMAL,
  total_cost_of_goods DECIMAL,
  net_profit DECIMAL,
  margin_percentage NUMERIC,
  roi_percentage NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  -- 🛡️ Membre du bar, propriétaire, ou super_admin.
  IF NOT (
    is_bar_member(p_bar_id)
    OR EXISTS (SELECT 1 FROM public.bars b WHERE b.id = p_bar_id AND b.owner_id = auth.uid())
    OR is_super_admin()
  ) THEN
    RAISE EXCEPTION 'Access denied: not a member of this bar' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.id as promotion_id,
    p.name as promotion_name,
    COUNT(pa.id)::BIGINT as total_applications,
    COALESCE(SUM(pa.discounted_price), 0)::DECIMAL as total_revenue,
    COALESCE(SUM(pa.discount_amount), 0)::DECIMAL as total_discount,
    COALESCE(SUM(pa.product_cost_total), 0)::DECIMAL as total_cost_of_goods,
    (COALESCE(SUM(pa.discounted_price), 0) - COALESCE(SUM(pa.product_cost_total), 0))::DECIMAL as net_profit,
    CASE
        WHEN COALESCE(SUM(pa.discounted_price), 0) > 0
        THEN ROUND(((COALESCE(SUM(pa.discounted_price), 0) - COALESCE(SUM(pa.product_cost_total), 0)) / COALESCE(SUM(pa.discounted_price), 0) * 100)::NUMERIC, 2)
        ELSE 0
    END::NUMERIC as margin_percentage,
    CASE
        WHEN COALESCE(SUM(pa.product_cost_total), 0) > 0
        THEN ROUND(((COALESCE(SUM(pa.discounted_price), 0) - COALESCE(SUM(pa.product_cost_total), 0)) / COALESCE(SUM(pa.product_cost_total), 0) * 100)::NUMERIC, 2)
        ELSE 0
    END::NUMERIC as roi_percentage
  FROM promotions p
  LEFT JOIN promotion_applications pa ON p.id = pa.promotion_id AND pa.bar_id = p_bar_id
  WHERE p.bar_id = p_bar_id
  AND (p_start_date IS NULL OR pa.applied_at >= p_start_date::TIMESTAMP)
  AND (p_end_date IS NULL OR pa.applied_at <= p_end_date::TIMESTAMP)
  GROUP BY p.id, p.name
  ORDER BY total_revenue DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_bar_promotion_stats_with_profit(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_bar_promotion_stats_with_profit(UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION get_bar_promotion_stats_with_profit(UUID, TEXT, TEXT) TO authenticated;
-- service_role conservé (cf. grant d'origine 20260105).
GRANT EXECUTE ON FUNCTION get_bar_promotion_stats_with_profit(UUID, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION get_bar_promotion_stats_with_profit(UUID, TEXT, TEXT) IS
'Stats promotions par promo avec profit. Guard membre/owner/super_admin ajouté 2026-06-23 (Vague 3).';

COMMIT;
