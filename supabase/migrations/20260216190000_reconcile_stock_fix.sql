-- =====================================================
-- MIGRATION: Global Stock Reconciliation Script
-- Date: 2026-02-16
-- Description: Recalculates physical stock based on initial supplies and validated sales.
-- =====================================================

CREATE OR REPLACE FUNCTION reconcile_all_stocks(p_bar_id UUID)
RETURNS TABLE (
  product_id UUID,
  display_name TEXT,
  old_stock INTEGER,
  new_stock INTEGER,
  diff INTEGER
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 0. CRITICAL: Lock all products for this bar to prevent concurrent updates (sales/cancellations)
  -- during the calculation phase. This ensures "Zero-Race" consistency.
  PERFORM id FROM bar_products WHERE bar_id = p_bar_id FOR UPDATE;

  RETURN QUERY
  WITH 
    -- 1. Total supplies (initial stock + additions)
    product_supplies AS (
      SELECT 
        s.product_id, 
        SUM(s.quantity)::INTEGER as total_in
      FROM supplies s
      WHERE s.bar_id = p_bar_id
      GROUP BY s.product_id
    ),
    -- 2. Total validated sales
    validated_sales AS (
      SELECT 
        (item->>'product_id')::UUID as product_id,
        SUM((item->>'quantity')::INTEGER)::INTEGER as total_out
      FROM sales s,
      jsonb_array_elements(items) as item
      WHERE s.bar_id = p_bar_id 
      AND s.status = 'validated'
      GROUP BY 1
    ),
    -- 3. Total stock adjustments (manual corrections)
    product_adjustments AS (
      SELECT 
        product_id, 
        SUM(delta)::INTEGER as total_delta
      FROM stock_adjustments
      WHERE bar_id = p_bar_id
      GROUP BY product_id
    ),
    -- 4. Total returns that were restocked
    product_returns AS (
      SELECT 
        product_id,
        SUM(quantity_returned)::INTEGER as total_restocked
      FROM returns
      WHERE bar_id = p_bar_id 
      AND status = 'restocked'
      GROUP BY product_id
    ),
    -- 5. Calculate should-be stock
    calculated_stock AS (
      SELECT 
        p.id as pid,
        p.display_name as p_name,
        p.stock as current_p_stock,
        (
          COALESCE(sup.total_in, 0) + 
          COALESCE(adj.total_delta, 0) + 
          COALESCE(ret.total_restocked, 0) - 
          COALESCE(sal.total_out, 0)
        ) as expected_stock
      FROM bar_products p
      LEFT JOIN product_supplies sup ON sup.product_id = p.id
      LEFT JOIN validated_sales sal ON sal.product_id = p.id
      LEFT JOIN product_adjustments adj ON adj.product_id = p.id
      LEFT JOIN product_returns ret ON ret.product_id = p.id
      WHERE p.bar_id = p_bar_id
      AND p.is_active = true
    )
  SELECT 
    pid, 
    p_name, 
    current_p_stock, 
    expected_stock,
    (expected_stock - current_p_stock) as stock_diff
  FROM calculated_stock;

  -- 6. PERFORM THE ACTUAL UPDATE
  UPDATE bar_products p
  SET stock = sub.expected_stock
  FROM (
      SELECT 
        p2.id,
        (
          COALESCE(sup.total_in, 0) + 
          COALESCE(adj.total_delta, 0) + 
          COALESCE(ret.total_restocked, 0) - 
          COALESCE(sal.total_out, 0)
        ) as expected_stock
      FROM bar_products p2
      LEFT JOIN product_supplies sup ON sup.product_id = p2.id
      LEFT JOIN validated_sales sal ON sal.product_id = p2.id
      LEFT JOIN product_adjustments adj ON adj.product_id = p2.id
      LEFT JOIN product_returns ret ON ret.product_id = p2.id
      WHERE p2.bar_id = p_bar_id
  ) sub
  WHERE p.id = sub.id AND p.bar_id = p_bar_id;

END;
$$;

-- Grant execution
GRANT EXECUTE ON FUNCTION reconcile_all_stocks(UUID) TO authenticated;
