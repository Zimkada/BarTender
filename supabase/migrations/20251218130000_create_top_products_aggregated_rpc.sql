-- Migration: Create RPC for aggregated top products (without date grouping)
-- Description: Create a function that aggregates top products by product only (not by date)
--              This fixes the issue where same product sold on different dates appears as multiple rows
-- Author: Technical Team
-- Date: 2025-12-18

-- =====================================================
-- RPC: get_top_products_aggregated
-- =====================================================
-- Purpose: Get top products aggregated by product_id only (not grouped by sale_date)
-- Returns: Aggregated products for a given bar and date range, sorted by metric

-- Drop existing function first to allow changing return type
DROP FUNCTION IF EXISTS get_top_products_aggregated(UUID, DATE, DATE, INT, TEXT);

CREATE FUNCTION get_top_products_aggregated(
  p_bar_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_limit INT DEFAULT 10,
  p_sort_by TEXT DEFAULT 'quantity' -- 'quantity', 'revenue', or 'profit'
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
    -- Get current CUMP for each product
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
      AVG((item->>'unit_price')::numeric) AS avg_unit_price,
      COALESCE(pc.current_average_cost, 0)::NUMERIC AS cump
    FROM sales s
    CROSS JOIN LATERAL jsonb_array_elements(s.items) AS item
    LEFT JOIN returns r ON r.sale_id = s.id
      AND r.product_id = (item->>'product_id')::uuid
    LEFT JOIN product_costs pc ON pc.id = (item->>'product_id')::uuid
    WHERE
      s.bar_id = p_bar_id
      AND s.status = 'validated'
      AND DATE(s.created_at - INTERVAL '6 hours') >= p_start_date
      AND DATE(s.created_at - INTERVAL '6 hours') <= p_end_date
    GROUP BY
      (item->>'product_id')::uuid,
      item->>'product_name',
      item->>'product_volume',
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

-- =====================================================
-- Grant permissions
-- =====================================================

GRANT EXECUTE ON FUNCTION get_top_products_aggregated(UUID, DATE, DATE, INT, TEXT) TO authenticated;

-- =====================================================
-- Documentation
-- =====================================================

COMMENT ON FUNCTION get_top_products_aggregated(UUID, DATE, DATE, INT, TEXT) IS
  'Aggregates top products by product_id only (not by sale_date). Returns aggregated metrics for a given bar and date range, sorted by specified metric (quantity, revenue, or profit). This function solves the issue where same product sold on different dates appeared as multiple separate rows.';
