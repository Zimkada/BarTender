-- MIGRATION: Fix RLS Policy (LIMIT 1 bug) and RPC get_top_products (business_date bug)
-- DATE: 2026-02-23
-- BUG #2 Fix: Ensure gérants can validate sales even if members of multiple bars (remove deterministic LIMIT 1)
-- BUG #5 Fix: Use business_date instead of hardcoded 6h interval for top products analytics

BEGIN;

-- 1. CORRECTION RLS: Managers can validate sales
-- Replace the policy with one using EXISTS for multi-bar support
DROP POLICY IF EXISTS "Managers can validate sales" ON public.sales;

CREATE POLICY "Managers can validate sales"
ON public.sales FOR UPDATE
TO authenticated
USING (
  -- User must be a manager of THE SPECIFIC BAR this sale belongs to
  EXISTS (
    SELECT 1 FROM public.bar_members bm
    WHERE bm.user_id = auth.uid()
    AND bm.bar_id = sales.bar_id
    AND bm.role IN ('gerant', 'promoteur', 'super_admin')
    AND bm.is_active = true
  )
)
WITH CHECK (
  -- Check remains same for security consistency
  EXISTS (
    SELECT 1 FROM public.bar_members bm
    WHERE bm.user_id = auth.uid()
    AND bm.bar_id = sales.bar_id
    AND bm.role IN ('gerant', 'promoteur', 'super_admin')
    AND bm.is_active = true
  )
);

COMMENT ON POLICY "Managers can validate sales" ON public.sales IS 'Managers can update (validate/reject) sales in their specific bar. Fixes multi-bar access bug.';


-- 2. CORRECTION RPC: get_top_products_by_server
-- Use business_date column for accurate temporal logic
DROP FUNCTION IF EXISTS get_top_products_by_server(UUID, TEXT, TEXT, UUID, INT, TEXT);

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

GRANT EXECUTE ON FUNCTION public.get_top_products_by_server TO authenticated;

COMMENT ON FUNCTION public.get_top_products_by_server IS
'Returns top products for a specific server. Corrected to use business_date for temporal accuracy.';

COMMIT;
