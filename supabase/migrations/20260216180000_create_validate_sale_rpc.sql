-- =====================================================
-- MIGRATION: Create Atomic Validate Sale RPC
-- Date: 2026-02-16
-- Description: Unifies sale status update and stock decrementation in a single transaction.
-- =====================================================

CREATE OR REPLACE FUNCTION validate_sale(
  p_sale_id UUID,
  p_validated_by UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bar_id UUID;
  v_status TEXT;
  v_item JSONB;
BEGIN
  -- 1. Lock the sale row and check status
  SELECT bar_id, status INTO v_bar_id, v_status
  FROM sales
  WHERE id = p_sale_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale not found';
  END IF;

  IF v_status != 'pending' THEN
    RAISE EXCEPTION 'Only pending sales can be validated (Current status: %)', v_status;
  END IF;

  -- 2. Decrement stock for each item
  FOR v_item IN SELECT * FROM jsonb_array_elements((SELECT items FROM sales WHERE id = p_sale_id))
  LOOP
    -- We use the existing decrement_stock RPC logic here to ensure consistency
    UPDATE bar_products
    SET stock = stock - (v_item->>'quantity')::INTEGER
    WHERE id = (v_item->>'product_id')::UUID
    AND bar_id = v_bar_id;
    
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % not found in bar %', v_item->>'product_id', v_bar_id;
    END IF;
  END LOOP;

  -- 3. Update sale status
  UPDATE sales
  SET 
    status = 'validated',
    validated_by = p_validated_by,
    validated_at = NOW()
  WHERE id = p_sale_id;

END;
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION validate_sale(UUID, UUID) TO authenticated;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
