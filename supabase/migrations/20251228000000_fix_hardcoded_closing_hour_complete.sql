-- MIGRATION: Fix Hardcoded Closing Hour (6h) in Analytics & Views
-- DATE: 2025-12-28
-- AUTHOR: AI Assistant
-- DESCRIPTION: 
-- This migration removes all hardcoded 'INTERVAL 6 hours' and 'DEFAULT 6' logic 
-- from analytics functions and materialized views.
-- FIXES: 
-- 1. Added 'public.' schema qualifiers.
-- 2. Fixed UNIQUE INDEX violation by aggregating product names.
-- 3. Fixed DEPENDENCY ORDER: Create base views first, then dependent views.

BEGIN;

-- ==============================================================================
-- 0. PRE-CLEANUP: Drop ALL dependent objects FIRST
-- ==============================================================================
DROP MATERIALIZED VIEW IF EXISTS public.bar_stats_multi_period_mat CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.daily_sales_summary_mat CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.top_products_by_period_mat CASCADE;


-- ==============================================================================
-- 1. FIX: get_current_business_date() to be DYNAMIC
-- ==============================================================================
DROP FUNCTION IF EXISTS public.get_current_business_date(UUID);
DROP FUNCTION IF EXISTS public.get_current_business_date();

CREATE OR REPLACE FUNCTION public.get_current_business_date(p_bar_id UUID)
RETURNS DATE AS $$
DECLARE
  v_closing_hour INT;
BEGIN
    SELECT closing_hour INTO v_closing_hour
    FROM public.bars
    WHERE id = p_bar_id;

    -- Default fallback if bar not found or null
    IF v_closing_hour IS NULL THEN
        v_closing_hour := 6;
    END IF;

    RETURN DATE(NOW() AT TIME ZONE 'UTC' - (v_closing_hour || ' hours')::INTERVAL);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION public.get_current_business_date(UUID) IS 'Returns the current business date for a specific Bar, respecting its closing_hour.';


-- ==============================================================================
-- 2. FIX: RPC get_top_products_aggregated (Use business_date column)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_top_products_aggregated(
  p_bar_id UUID,
  p_start_date DATE,
  p_end_date DATE,
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
  avg_unit_price NUMERIC,
  profit NUMERIC,
  updated_at TIMESTAMP
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  WITH product_costs AS (
    SELECT id, current_average_cost
    FROM public.bar_products
    WHERE bar_id = p_bar_id
  ),
  aggregated_products AS (
    SELECT
      (item->>'product_id')::uuid AS product_id,
      MAX(item->>'product_name') AS product_name,
      MAX(item->>'product_volume') AS product_volume,
      COUNT(DISTINCT s.id)::BIGINT AS transaction_count,
      (SUM((item->>'quantity')::integer) -
       COALESCE(SUM(r.quantity_returned) FILTER (WHERE r.status IN ('approved', 'restocked') AND r.is_refunded = true), 0))::INT AS total_quantity,
      (SUM((item->>'total_price')::numeric) -
       COALESCE(SUM(r.refund_amount) FILTER (WHERE r.status IN ('approved', 'restocked') AND r.is_refunded = true), 0))::NUMERIC AS total_revenue,
      COALESCE(SUM(r.quantity_returned) FILTER (WHERE r.status IN ('approved', 'restocked') AND r.is_refunded = true), 0)::INT AS total_quantity_returned,
      COALESCE(SUM(r.refund_amount) FILTER (WHERE r.status IN ('approved', 'restocked') AND r.is_refunded = true), 0)::NUMERIC AS total_refunded,
      AVG((item->>'unit_price')::numeric) AS avg_unit_price,
      COALESCE(pc.current_average_cost, 0)::NUMERIC AS cump
    FROM public.sales s
    CROSS JOIN LATERAL jsonb_array_elements(s.items) AS item
    LEFT JOIN public.returns r ON r.sale_id = s.id
      AND r.product_id = (item->>'product_id')::uuid
    LEFT JOIN product_costs pc ON pc.id = (item->>'product_id')::uuid
    WHERE
      s.bar_id = p_bar_id
      AND s.status = 'validated'
      AND s.business_date >= p_start_date
      AND s.business_date <= p_end_date
    GROUP BY
      (item->>'product_id')::uuid,
      pc.current_average_cost
  )
  SELECT
    product_id,
    product_name,
    product_volume,
    transaction_count,
    total_quantity,
    total_revenue,
    total_quantity_returned,
    total_refunded,
    avg_unit_price,
    (total_revenue - (total_quantity * cump)) AS profit,
    NOW() AS updated_at
  FROM aggregated_products
  ORDER BY
    CASE p_sort_by
      WHEN 'revenue' THEN total_revenue
      WHEN 'profit' THEN (total_revenue - (total_quantity * cump))
      ELSE total_quantity
    END DESC NULLS LAST
  LIMIT p_limit;
$$;


-- ==============================================================================
-- 3. FIX: RPC get_top_products_by_server (Use business_date column)
-- ==============================================================================
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
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  WITH product_costs AS (
    SELECT id, current_average_cost
    FROM public.bar_products
    WHERE bar_id = p_bar_id
  ),
  aggregated_products AS (
    SELECT
      (item->>'product_id')::uuid AS product_id,
      MAX(item->>'product_name') AS product_name,
      MAX(item->>'product_volume') AS product_volume,
      COUNT(DISTINCT s.id)::BIGINT AS transaction_count,
      (SUM((item->>'quantity')::integer) -
       COALESCE(SUM(r.quantity_returned) FILTER (WHERE r.status IN ('approved', 'restocked') AND r.is_refunded = true), 0))::INT AS total_quantity,
      (SUM((item->>'total_price')::numeric) -
       COALESCE(SUM(r.refund_amount) FILTER (WHERE r.status IN ('approved', 'restocked') AND r.is_refunded = true), 0))::NUMERIC AS total_revenue,
      COALESCE(SUM(r.quantity_returned) FILTER (WHERE r.status IN ('approved', 'restocked') AND r.is_refunded = true), 0)::INT AS total_quantity_returned,
      COALESCE(SUM(r.refund_amount) FILTER (WHERE r.status IN ('approved', 'restocked') AND r.is_refunded = true), 0)::NUMERIC AS total_refunded,
      AVG((item->>'unit_price')::numeric) AS avg_unit_price
    FROM public.sales s
    CROSS JOIN LATERAL jsonb_array_elements(s.items) AS item
    LEFT JOIN public.returns r ON r.sale_id = s.id
      AND r.product_id = (item->>'product_id')::uuid
    LEFT JOIN product_costs pc ON pc.id = (item->>'product_id')::uuid
    WHERE
      s.bar_id = p_bar_id
      AND s.status = 'validated'
      AND s.business_date >= p_start_date::DATE
      AND s.business_date <= p_end_date::DATE
      AND (p_server_id IS NULL OR s.server_id = p_server_id OR s.created_by = p_server_id)
    GROUP BY
      (item->>'product_id')::uuid
  )
  SELECT
    product_id,
    product_name,
    product_volume,
    transaction_count,
    total_quantity,
    total_revenue,
    total_quantity_returned,
    total_refunded,
    avg_unit_price
  FROM aggregated_products
  ORDER BY
    CASE p_sort_by
      WHEN 'revenue' THEN total_revenue
      ELSE total_quantity
    END DESC NULLS LAST
  LIMIT p_limit;
$$;


-- ==============================================================================
-- 4. FIX: daily_sales_summary_mat AND top_products_by_period_mat (BASE VIEWS)
-- ==============================================================================

-- 4a. daily_sales_summary_mat
CREATE MATERIALIZED VIEW public.daily_sales_summary_mat AS
SELECT
  s.bar_id,
  s.business_date AS sale_date,
  DATE_TRUNC('week', s.business_date) AS sale_week,
  DATE_TRUNC('month', s.business_date) AS sale_month,

  COUNT(*) FILTER (WHERE s.status = 'validated') AS validated_count,
  COUNT(*) FILTER (WHERE s.status = 'pending') AS pending_count,
  COUNT(*) FILTER (WHERE s.status = 'rejected') AS rejected_count,

  COALESCE(SUM(s.total) FILTER (WHERE s.status = 'validated'), 0) AS gross_revenue,

  COALESCE(
    SUM(
      (SELECT SUM((item->>'quantity')::integer)
       FROM jsonb_array_elements(s.items) AS item)
    ) FILTER (WHERE s.status = 'validated'),
    0
  ) AS total_items_sold,

  COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'approved') AS returns_approved_count,
  COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'pending') AS returns_pending_count,
  COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'rejected') AS returns_rejected_count,

  COALESCE(
    SUM(r.refund_amount) FILTER (WHERE r.status = 'approved' AND r.refund_amount IS NOT NULL),
    0
  ) AS total_refunded,

  COALESCE(SUM(s.total) FILTER (WHERE s.status = 'validated'), 0) -
  COALESCE(
    SUM(r.refund_amount) FILTER (WHERE r.status = 'approved' AND r.refund_amount IS NOT NULL),
    0
  ) AS net_revenue,

  NOW() AS updated_at

FROM public.sales s
LEFT JOIN public.returns r ON r.sale_id = s.id 
  AND r.bar_id = s.bar_id
  AND r.business_date = s.business_date

WHERE s.created_at >= NOW() - INTERVAL '365 days'
GROUP BY
  s.bar_id,
  s.business_date,
  DATE_TRUNC('week', s.business_date),
  DATE_TRUNC('month', s.business_date);

CREATE UNIQUE INDEX idx_daily_sales_summary_mat_pk ON public.daily_sales_summary_mat(bar_id, sale_date);
CREATE INDEX idx_daily_sales_summary_mat_week ON public.daily_sales_summary_mat(bar_id, sale_week);
CREATE INDEX idx_daily_sales_summary_mat_month ON public.daily_sales_summary_mat(bar_id, sale_month);

CREATE OR REPLACE VIEW public.daily_sales_summary AS
SELECT *
FROM public.daily_sales_summary_mat
WHERE bar_id IN (
  SELECT bar_id FROM public.bar_members WHERE user_id = auth.uid()
);
GRANT SELECT ON public.daily_sales_summary TO authenticated;


-- 4b. top_products_by_period_mat
CREATE MATERIALIZED VIEW public.top_products_by_period_mat AS
SELECT
  s.bar_id,
  s.business_date AS sale_date,
  DATE_TRUNC('week', s.business_date) AS sale_week,
  DATE_TRUNC('month', s.business_date) AS sale_month,

  (item->>'product_id')::uuid AS product_id,
  MAX(item->>'product_name') AS product_name,
  MAX(item->>'product_volume') AS product_volume,

  COUNT(DISTINCT s.id) AS transaction_count,
  SUM((item->>'quantity')::integer) AS total_quantity_gross,
  SUM((item->>'total_price')::numeric) AS total_revenue_gross,

  COALESCE(SUM(r.quantity_returned) FILTER (WHERE r.status IN ('approved', 'restocked') AND r.is_refunded = true), 0) AS total_quantity_returned,
  COALESCE(SUM(r.refund_amount) FILTER (WHERE r.status IN ('approved', 'restocked') AND r.is_refunded = true), 0) AS total_refunded,

  SUM((item->>'quantity')::integer) - 
  COALESCE(SUM(r.quantity_returned) FILTER (WHERE r.status IN ('approved', 'restocked') AND r.is_refunded = true), 0) 
  AS total_quantity,

  SUM((item->>'total_price')::numeric) - 
  COALESCE(SUM(r.refund_amount) FILTER (WHERE r.status IN ('approved', 'restocked') AND r.is_refunded = true), 0) 
  AS total_revenue,

  AVG((item->>'unit_price')::numeric) AS avg_unit_price,

  NOW() AS updated_at

FROM public.sales s
CROSS JOIN LATERAL jsonb_array_elements(s.items) AS item
LEFT JOIN public.returns r ON r.sale_id = s.id 
  AND r.product_id = (item->>'product_id')::uuid

WHERE
  s.status = 'validated'
  AND s.created_at >= NOW() - INTERVAL '365 days'

GROUP BY
  s.bar_id,
  s.business_date,
  DATE_TRUNC('week', s.business_date),
  DATE_TRUNC('month', s.business_date),
  (item->>'product_id')::uuid;

CREATE UNIQUE INDEX idx_top_products_mat_pk ON public.top_products_by_period_mat(bar_id, sale_date, product_id);
CREATE INDEX idx_top_products_mat_bar_date ON public.top_products_by_period_mat(bar_id, sale_date);
CREATE INDEX idx_top_products_mat_quantity ON public.top_products_by_period_mat(bar_id, total_quantity DESC);

CREATE OR REPLACE VIEW public.top_products_by_period AS
SELECT *
FROM public.top_products_by_period_mat
WHERE bar_id IN (
  SELECT bar_id FROM public.bar_members WHERE user_id = auth.uid()
);
GRANT SELECT ON public.top_products_by_period TO authenticated;


-- ==============================================================================
-- 5. FIX: bar_stats_multi_period_mat (DEPENDENT VIEW - CREATE LAST)
-- ==============================================================================

CREATE MATERIALIZED VIEW public.bar_stats_multi_period_mat AS
SELECT
  bar_id,

  -- Aujourd'hui
  (SELECT COALESCE(SUM(gross_revenue), 0)
   FROM public.daily_sales_summary_mat
   WHERE bar_id = s.bar_id AND sale_date = public.get_current_business_date(s.bar_id)) AS revenue_today,
  (SELECT COALESCE(SUM(validated_count), 0)
   FROM public.daily_sales_summary_mat
   WHERE bar_id = s.bar_id AND sale_date = public.get_current_business_date(s.bar_id)) AS sales_today,

  -- Hier
  (SELECT COALESCE(SUM(gross_revenue), 0)
   FROM public.daily_sales_summary_mat
   WHERE bar_id = s.bar_id AND sale_date = (public.get_current_business_date(s.bar_id) - 1)) AS revenue_yesterday,
  (SELECT COALESCE(SUM(validated_count), 0)
   FROM public.daily_sales_summary_mat
   WHERE bar_id = s.bar_id AND sale_date = (public.get_current_business_date(s.bar_id) - 1)) AS sales_yesterday,

  -- 7 derniers jours
  (SELECT COALESCE(SUM(gross_revenue), 0)
   FROM public.daily_sales_summary_mat
   WHERE bar_id = s.bar_id 
     AND sale_date >= (public.get_current_business_date(s.bar_id) - 7) 
     AND sale_date < public.get_current_business_date(s.bar_id)) AS revenue_7d,
  (SELECT COALESCE(SUM(validated_count), 0)
   FROM public.daily_sales_summary_mat
   WHERE bar_id = s.bar_id 
     AND sale_date >= (public.get_current_business_date(s.bar_id) - 7) 
     AND sale_date < public.get_current_business_date(s.bar_id)) AS sales_7d,

  -- 30 derniers jours
  (SELECT COALESCE(SUM(gross_revenue), 0)
   FROM public.daily_sales_summary_mat
   WHERE bar_id = s.bar_id 
     AND sale_date >= (public.get_current_business_date(s.bar_id) - 30) 
     AND sale_date < public.get_current_business_date(s.bar_id)) AS revenue_30d,
  (SELECT COALESCE(SUM(validated_count), 0)
   FROM public.daily_sales_summary_mat
   WHERE bar_id = s.bar_id 
     AND sale_date >= (public.get_current_business_date(s.bar_id) - 30) 
     AND sale_date < public.get_current_business_date(s.bar_id)) AS sales_30d,

  NOW() AS updated_at

FROM (SELECT id AS bar_id FROM public.bars WHERE is_active = true) s;

CREATE UNIQUE INDEX idx_bar_stats_multi_period_mat_pk ON public.bar_stats_multi_period_mat(bar_id);

CREATE OR REPLACE VIEW public.bar_stats_multi_period AS
SELECT *
FROM public.bar_stats_multi_period_mat
WHERE
  bar_id IN (SELECT bar_id FROM public.bar_members WHERE user_id = auth.uid())
  OR
  EXISTS (
    SELECT 1 FROM public.bar_members
    WHERE user_id = auth.uid() AND role = 'super_admin' AND is_active = true
  );

GRANT SELECT ON public.bar_stats_multi_period TO authenticated;


-- ==============================================================================
-- 6. REFRESH ALL
-- ==============================================================================

REFRESH MATERIALIZED VIEW CONCURRENTLY public.daily_sales_summary_mat;
REFRESH MATERIALIZED VIEW CONCURRENTLY public.top_products_by_period_mat;
REFRESH MATERIALIZED VIEW CONCURRENTLY public.bar_stats_multi_period_mat;

COMMIT;
