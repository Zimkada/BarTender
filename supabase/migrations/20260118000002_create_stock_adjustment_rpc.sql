-- =====================================================
-- Migration: Create RPC create_stock_adjustment
-- Description: Atomically create adjustment and update stock
--              Server-side validation and role checking
-- Date: 2026-01-18
-- =====================================================

BEGIN;

CREATE OR REPLACE FUNCTION create_stock_adjustment(
  p_bar_id UUID,
  p_product_id UUID,
  p_delta INTEGER,
  p_reason TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  bar_id UUID,
  product_id UUID,
  old_stock INTEGER,
  new_stock INTEGER,
  delta INTEGER,
  reason TEXT,
  notes TEXT,
  adjusted_by UUID,
  adjusted_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_stock INTEGER;
  v_new_stock INTEGER;
BEGIN
  -- Verify user is promoteur in this bar (most restrictive)
  IF NOT (get_user_role(p_bar_id) = 'promoteur' OR is_super_admin()) THEN
    RAISE EXCEPTION 'Only promoteur can adjust stock';
  END IF;

  -- Validate reason enum
  IF p_reason NOT IN ('inventory_count', 'loss_damage', 'donation_sample', 'expiration', 'theft_report', 'other') THEN
    RAISE EXCEPTION 'Invalid reason: %', p_reason;
  END IF;

  -- Require notes for 'other' reason
  IF p_reason = 'other' AND (p_notes IS NULL OR p_notes = '') THEN
    RAISE EXCEPTION 'Notes are required when reason is "other"';
  END IF;

  -- Get current stock with row lock (prevent race conditions)
  SELECT stock INTO v_current_stock
  FROM bar_products bp
  WHERE bp.id = p_product_id AND bp.bar_id = p_bar_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found in this bar';
  END IF;

  -- Calculate new stock
  v_new_stock := v_current_stock + p_delta;

  -- Validate new stock
  IF v_new_stock < 0 THEN
    RAISE EXCEPTION 'Adjustment would result in negative stock (% -> %)', v_current_stock, v_new_stock;
  END IF;

  -- Insert adjustment record and update product stock atomically
  RETURN QUERY
  WITH new_adjustment AS (
    INSERT INTO stock_adjustments (
      bar_id, product_id,
      old_stock, new_stock, delta,
      reason, notes,
      adjusted_by
    )
    VALUES (
      p_bar_id, p_product_id,
      v_current_stock, v_new_stock, p_delta,
      p_reason, p_notes,
      auth.uid()
    )
    RETURNING
      stock_adjustments.id,
      stock_adjustments.bar_id,
      stock_adjustments.product_id,
      stock_adjustments.old_stock,
      stock_adjustments.new_stock,
      stock_adjustments.delta,
      stock_adjustments.reason,
      stock_adjustments.notes,
      stock_adjustments.adjusted_by,
      stock_adjustments.adjusted_at
  ),
  update_product AS (
    UPDATE bar_products
    SET stock = v_new_stock,
        updated_at = NOW()
    WHERE bar_products.id = p_product_id
    RETURNING 1
  )
  SELECT
    new_adjustment.id,
    new_adjustment.bar_id,
    new_adjustment.product_id,
    new_adjustment.old_stock,
    new_adjustment.new_stock,
    new_adjustment.delta,
    new_adjustment.reason,
    new_adjustment.notes,
    new_adjustment.adjusted_by,
    new_adjustment.adjusted_at
  FROM new_adjustment;
END;
$$;

GRANT EXECUTE ON FUNCTION create_stock_adjustment(UUID, UUID, INTEGER, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION create_stock_adjustment(UUID, UUID, INTEGER, TEXT, TEXT) IS 'Create stock adjustment with atomic update. Only promoteur can call. Returns adjustment record.';

COMMIT;
