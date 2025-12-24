-- MIGRATION: Update create_sale_with_promotions RPC to accept and handle server_id
-- DATE: 2025-12-24
-- PURPOSE: Support mode switching by accepting server_id parameter
--
-- New parameter: p_server_id UUID
-- - In full mode: pass the creator's UUID (same as p_sold_by)
-- - In simplified mode: pass the mapped server UUID (resolved from server_name by frontend)
--
-- IMPORTANT: This updates the existing RPC function, maintaining backwards compatibility
-- Existing calls without p_server_id will still work (server_id will be NULL, can be backfilled)

BEGIN;

-- =====================================================
-- STEP 1: Update create_sale_with_promotions RPC function
-- =====================================================
CREATE OR REPLACE FUNCTION public.create_sale_with_promotions(
  p_bar_id UUID,
  p_items JSONB,
  p_payment_method TEXT,
  p_sold_by UUID,
  p_server_id UUID DEFAULT NULL,  -- NEW PARAMETER
  p_status TEXT DEFAULT 'validated',
  p_customer_name TEXT DEFAULT NULL,
  p_customer_phone TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_business_date DATE DEFAULT NULL
)
RETURNS TABLE (
  sale_id UUID,
  created_at TIMESTAMP WITH TIME ZONE,
  business_date DATE,
  total_amount DECIMAL,
  error_message TEXT
) AS $$
DECLARE
  v_sale_id UUID;
  v_business_date DATE;
  v_total_amount DECIMAL := 0;
  v_item JSONB;
  v_product_id UUID;
  v_quantity INT;
  v_unit_price DECIMAL;
  v_product_stock INT;
BEGIN
  -- Validate inputs
  IF p_bar_id IS NULL OR p_sold_by IS NULL OR p_items IS NULL THEN
    RETURN QUERY SELECT
      NULL::UUID,
      NULL::TIMESTAMP WITH TIME ZONE,
      NULL::DATE,
      NULL::DECIMAL,
      'Missing required parameters'::TEXT;
    RETURN;
  END IF;

  -- Determine business date
  v_business_date := COALESCE(p_business_date, CURRENT_DATE);

  -- Validate business_date is in correct timezone context
  -- (Assuming p_business_date comes pre-calculated from frontend with correct timezone)

  -- Process each item
  FOR v_item IN SELECT jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::INT;
    v_unit_price := (v_item->>'unit_price')::DECIMAL;

    IF v_product_id IS NULL OR v_quantity IS NULL OR v_unit_price IS NULL THEN
      RETURN QUERY SELECT
        NULL::UUID,
        NULL::TIMESTAMP WITH TIME ZONE,
        NULL::DATE,
        NULL::DECIMAL,
        'Invalid item format'::TEXT;
      RETURN;
    END IF;

    -- Check stock
    SELECT stock INTO v_product_stock
    FROM public.products
    WHERE id = v_product_id AND bar_id = p_bar_id;

    IF v_product_stock IS NULL OR v_product_stock < v_quantity THEN
      RETURN QUERY SELECT
        NULL::UUID,
        NULL::TIMESTAMP WITH TIME ZONE,
        NULL::DATE,
        NULL::DECIMAL,
        'Insufficient stock for product: ' || v_product_id::TEXT;
      RETURN;
    END IF;

    -- Accumulate total
    v_total_amount := v_total_amount + (v_unit_price * v_quantity);
  END LOOP;

  -- Create the sale record
  INSERT INTO public.sales (
    bar_id,
    sold_by,
    server_id,  -- NEW: Insert server_id
    payment_method,
    customer_name,
    customer_phone,
    notes,
    status,
    business_date,
    created_at,
    validated_at
  ) VALUES (
    p_bar_id,
    p_sold_by,
    p_server_id,  -- NEW: Use provided server_id (or NULL if not provided)
    p_payment_method,
    p_customer_name,
    p_customer_phone,
    p_notes,
    p_status,
    v_business_date,
    CURRENT_TIMESTAMP,
    CASE WHEN p_status = 'validated' THEN CURRENT_TIMESTAMP ELSE NULL END
  )
  RETURNING id INTO v_sale_id;

  -- Deduct stock for each item
  FOR v_item IN SELECT jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::INT;
    v_unit_price := (v_item->>'unit_price')::DECIMAL;

    UPDATE public.products
    SET stock = stock - v_quantity
    WHERE id = v_product_id AND bar_id = p_bar_id;

    -- Create sale_items
    INSERT INTO public.sale_items (
      sale_id,
      product_id,
      product_name,
      quantity,
      unit_price,
      total_price
    )
    SELECT
      v_sale_id,
      v_product_id,
      p.name,
      v_quantity,
      v_unit_price,
      v_unit_price * v_quantity
    FROM public.products p
    WHERE p.id = v_product_id;
  END LOOP;

  RETURN QUERY SELECT
    v_sale_id,
    CURRENT_TIMESTAMP,
    v_business_date,
    v_total_amount,
    NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT
    NULL::UUID,
    NULL::TIMESTAMP WITH TIME ZONE,
    NULL::DATE,
    NULL::DECIMAL,
    SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.create_sale_with_promotions(UUID, JSONB, TEXT, UUID, UUID, TEXT, TEXT, TEXT, TEXT, DATE) IS 'Create a sale with promotion handling. New parameter p_server_id tracks which server (in simplified mode) performed the sale.';

COMMIT;
