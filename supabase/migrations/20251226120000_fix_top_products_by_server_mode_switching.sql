-- MIGRATION: Fix get_top_products_by_server RPC for Mode Switching
-- DATE: 2025-12-26
-- PURPOSE: Add created_by filter to support mode switching (simplified ↔ full)
-- BUG FIX: Servers could not see their top products after mode switching because
--          the RPC only filtered by server_id (simplified mode) but ignored created_by (full mode)

-- Drop existing function
DROP FUNCTION IF EXISTS get_top_products_by_server(UUID, TEXT, TEXT, UUID, INT, TEXT);

-- Recreate with mode-switching support
CREATE FUNCTION public.get_top_products_by_server(
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
      AVG((item->>'unit_price')::numeric) AS avg_unit_price
    FROM sales s
    CROSS JOIN LATERAL jsonb_array_elements(s.items) AS item
    LEFT JOIN returns r ON r.sale_id = s.id
      AND r.product_id = (item->>'product_id')::uuid
    LEFT JOIN product_costs pc ON pc.id = (item->>'product_id')::uuid
    WHERE
      s.bar_id = p_bar_id
      AND s.status = 'validated'
      AND DATE(s.created_at - INTERVAL '6 hours') >= p_start_date::DATE
      AND DATE(s.created_at - INTERVAL '6 hours') <= p_end_date::DATE
      -- ✨ MODE SWITCHING FIX: Filter by server using OR logic
      -- A server should see sales where they are EITHER the assigned server (simplified mode)
      -- OR the seller (full mode). This ensures data visibility persists across mode switches.
      AND (p_server_id IS NULL OR s.server_id = p_server_id OR s.sold_by = p_server_id)
    GROUP BY
      (item->>'product_id')::uuid,
      item->>'product_name',
      item->>'product_volume'
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

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_top_products_by_server TO authenticated;

-- Add comment explaining the fix
COMMENT ON FUNCTION public.get_top_products_by_server IS
'Returns top products for a specific server with mode-switching support.
Filters sales by either server_id (simplified mode) OR created_by (full mode) to ensure
servers can see all their sales regardless of the operating mode at creation time.';
