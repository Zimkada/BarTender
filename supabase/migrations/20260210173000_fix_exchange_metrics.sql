-- =====================================================
-- Migration: Correction des métriques financières pour les échanges (Magic Swap)
-- Date: 2026-02-10
-- Objectif: Inclure les retours de type "exchange" dans les déductions de CA et d'unités
-- =====================================================

BEGIN;

-- 1. Mise à jour de get_top_products_aggregated
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
       COALESCE(SUM(r.quantity_returned) FILTER (WHERE r.status IN ('approved', 'restocked', 'validated') AND (r.is_refunded = true OR r.reason = 'exchange')), 0))::INT AS total_quantity,
      (SUM((item->>'total_price')::numeric) -
       COALESCE(SUM(r.refund_amount) FILTER (WHERE r.status IN ('approved', 'restocked', 'validated') AND (r.is_refunded = true OR r.reason = 'exchange')), 0))::NUMERIC AS total_revenue,
      COALESCE(SUM(r.quantity_returned) FILTER (WHERE r.status IN ('approved', 'restocked', 'validated') AND (r.is_refunded = true OR r.reason = 'exchange')), 0)::INT AS total_quantity_returned,
      COALESCE(SUM(r.refund_amount) FILTER (WHERE r.status IN ('approved', 'restocked', 'validated') AND (r.is_refunded = true OR r.reason = 'exchange')), 0)::NUMERIC AS total_refunded,
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

-- 2. Mise à jour de get_top_products_by_server
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
       COALESCE(SUM(r.quantity_returned) FILTER (WHERE r.status IN ('approved', 'restocked', 'validated') AND (r.is_refunded = true OR r.reason = 'exchange')), 0))::INT AS total_quantity,
      (SUM((item->>'total_price')::numeric) -
       COALESCE(SUM(r.refund_amount) FILTER (WHERE r.status IN ('approved', 'restocked', 'validated') AND (r.is_refunded = true OR r.reason = 'exchange')), 0))::NUMERIC AS total_revenue,
      COALESCE(SUM(r.quantity_returned) FILTER (WHERE r.status IN ('approved', 'restocked', 'validated') AND (r.is_refunded = true OR r.reason = 'exchange')), 0)::INT AS total_quantity_returned,
      COALESCE(SUM(r.refund_amount) FILTER (WHERE r.status IN ('approved', 'restocked', 'validated') AND (r.is_refunded = true OR r.reason = 'exchange')), 0)::NUMERIC AS total_refunded,
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
      AND (p_server_id IS NULL OR s.server_id = p_server_id OR s.sold_by = p_server_id)
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

-- 3. Mise à jour de top_products_by_period_mat
DROP MATERIALIZED VIEW IF EXISTS public.top_products_by_period_mat CASCADE;

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

  COALESCE(SUM(r.quantity_returned) FILTER (WHERE r.status IN ('approved', 'restocked', 'validated') AND (r.is_refunded = true OR r.reason = 'exchange')), 0) AS total_quantity_returned,
  COALESCE(SUM(r.refund_amount) FILTER (WHERE r.status IN ('approved', 'restocked', 'validated') AND (r.is_refunded = true OR r.reason = 'exchange')), 0) AS total_refunded,

  SUM((item->>'quantity')::integer) - 
  COALESCE(SUM(r.quantity_returned) FILTER (WHERE r.status IN ('approved', 'restocked', 'validated') AND (r.is_refunded = true OR r.reason = 'exchange')), 0) 
  AS total_quantity,

  SUM((item->>'total_price')::numeric) - 
  COALESCE(SUM(r.refund_amount) FILTER (WHERE r.status IN ('approved', 'restocked', 'validated') AND (r.is_refunded = true OR r.reason = 'exchange')), 0) 
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

-- Index
CREATE UNIQUE INDEX idx_top_products_mat_pk ON public.top_products_by_period_mat(bar_id, sale_date, product_id);
CREATE INDEX idx_top_products_mat_bar_date ON public.top_products_by_period_mat(bar_id, sale_date);
CREATE INDEX idx_top_products_mat_quantity ON public.top_products_by_period_mat(bar_id, total_quantity DESC);

-- View pour RLS
CREATE OR REPLACE VIEW public.top_products_by_period AS
SELECT *
FROM public.top_products_by_period_mat
WHERE bar_id IN (
  SELECT bar_id FROM public.bar_members WHERE user_id = auth.uid()
);
GRANT SELECT ON public.top_products_by_period TO authenticated;

-- 4. Rafraîchissement final
REFRESH MATERIALIZED VIEW CONCURRENTLY public.top_products_by_period_mat;

COMMIT;
