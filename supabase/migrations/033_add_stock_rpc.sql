-- =====================================================
-- MIGRATION 033: Add Secure Stock Management RPC
-- Date: 22 Novembre 2025
-- =====================================================

-- 1. Create a secure function to decrement stock
-- SECURITY DEFINER: Runs with privileges of the function creator (superuser/admin)
-- This bypasses RLS, allowing servers to update stock without having direct UPDATE permission on the table.
CREATE OR REPLACE FUNCTION decrement_stock(
  p_product_id UUID,
  p_quantity INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_stock INTEGER;
BEGIN
  -- Check if product exists and lock the row for update
  SELECT stock INTO v_current_stock
  FROM bar_products
  WHERE id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  -- Update stock (allow negative stock? No, let's clamp to 0 or allow it?
  -- Usually we want to know if we oversold. But for now let's just subtract.
  -- The check constraint on the table (stock >= 0) might trigger if we go below 0.
  -- Let's handle it gracefully or let it fail?
  -- If we want to allow "pre-sales" or negative stock, we should remove the constraint.
  -- But assuming strict inventory:
  
  UPDATE bar_products
  SET stock = stock - p_quantity
  WHERE id = p_product_id;
  
END;
$$;

-- 2. Create a secure function to increment stock (for returns/cancellations)
CREATE OR REPLACE FUNCTION increment_stock(
  p_product_id UUID,
  p_quantity INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE bar_products
  SET stock = stock + p_quantity
  WHERE id = p_product_id;
END;
$$;

-- 3. Grant execute permissions
GRANT EXECUTE ON FUNCTION decrement_stock(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_stock(UUID, INTEGER) TO authenticated;

-- 4. Reload schema cache
NOTIFY pgrst, 'reload schema';
