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
-- Drop the existing function first (return type changed from TABLE to sales)
DROP FUNCTION IF EXISTS public.create_sale_with_promotions(UUID, JSONB, TEXT, UUID, UUID, TEXT, TEXT, TEXT, TEXT, DATE) CASCADE;

CREATE FUNCTION public.create_sale_with_promotions(
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
RETURNS sales  -- ✨ FIXED: Return complete sales row, not TABLE
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sale sales;
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
    RAISE EXCEPTION 'Missing required parameters: bar_id, sold_by, items';
  END IF;

  -- Determine business date
  v_business_date := COALESCE(p_business_date, CURRENT_DATE);

  -- Validate business_date is in correct timezone context
  -- (Assuming p_business_date comes pre-calculated from frontend with correct timezone)

  -- Process each item and calculate totals
  FOR v_item IN SELECT jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::INT;
    v_unit_price := (v_item->>'unit_price')::DECIMAL;

    IF v_product_id IS NULL OR v_quantity IS NULL OR v_unit_price IS NULL THEN
      RAISE EXCEPTION 'Invalid item format in sale items';
    END IF;

    -- Accumulate total
    v_total_amount := v_total_amount + (v_unit_price * v_quantity);
  END LOOP;

  -- Create the sale record
  INSERT INTO public.sales (
    bar_id,
    items,  -- Store items as JSONB (required)
    subtotal,  -- Calculate subtotal
    discount_total,  -- Calculate discount total
    total,  -- Calculate final total
    payment_method,  -- Required
    status,  -- Set status
    sold_by,  -- Who created the sale (required)
    validated_by,  -- Set if status is validated
    validated_at,  -- Set if status is validated
    applied_promotions,  -- Store applied promotions
    server_id,  -- NEW: Insert server_id
    created_by,  -- Audit trail
    customer_name,  -- Optional customer info
    customer_phone,  -- Optional customer info
    notes,  -- Optional notes
    business_date,  -- Business date
    created_at  -- Timestamp
  ) VALUES (
    p_bar_id,
    p_items,  -- Store items array
    v_total_amount,  -- Subtotal = total of all items (no discounts yet)
    0,  -- discount_total - calculated later when promotions are applied
    v_total_amount,  -- total = subtotal - discount (no discounts yet)
    p_payment_method,  -- Payment method (required)
    p_status,  -- Use provided status
    p_sold_by,  -- Who created the sale (required)
    CASE WHEN p_status = 'validated' THEN p_sold_by ELSE NULL END,  -- validated_by if validated
    CASE WHEN p_status = 'validated' THEN CURRENT_TIMESTAMP ELSE NULL END,  -- validated_at if validated
    '[]'::JSONB,  -- Empty promotions array initially
    p_server_id,  -- Use provided server_id (or NULL if not provided)
    p_sold_by,  -- Audit: who created (same as sold_by)
    p_customer_name,  -- Customer name
    p_customer_phone,  -- Customer phone
    p_notes,  -- Notes
    v_business_date,  -- Business date
    CURRENT_TIMESTAMP  -- Created timestamp
  )
  RETURNING * INTO v_sale;

  -- Deduct stock for each item
  FOR v_item IN SELECT jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::INT;

    UPDATE public.bar_products
    SET stock = stock - v_quantity
    WHERE id = v_product_id AND bar_id = p_bar_id;
  END LOOP;

  -- Return the complete sales row
  RETURN v_sale;

EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'Error creating sale: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION public.create_sale_with_promotions(UUID, JSONB, TEXT, UUID, UUID, TEXT, TEXT, TEXT, TEXT, DATE) IS 'Create a sale with promotion handling. New parameter p_server_id tracks which server (in simplified mode) performed the sale.';

COMMIT;
