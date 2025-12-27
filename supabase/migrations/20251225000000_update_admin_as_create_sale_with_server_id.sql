-- MIGRATION: Update admin_as_create_sale RPC to accept and handle server_id
-- DATE: 2025-12-25
-- PURPOSE: Support mode switching by accepting server_id parameter in proxy sales
--
-- New parameter: p_server_id UUID
-- - In full mode: pass the creator's UUID (same as p_acting_as_user_id)
-- - In simplified mode: pass the mapped server UUID (resolved from server_name by frontend)
--
-- IMPORTANT: This updates the existing RPC function, maintaining backwards compatibility
-- Existing calls without p_server_id will still work (server_id will be NULL)

BEGIN;

-- =====================================================
-- STEP 1: Update admin_as_create_sale RPC function
-- =====================================================
DROP FUNCTION IF EXISTS admin_as_create_sale(UUID, UUID, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, DATE);

CREATE OR REPLACE FUNCTION admin_as_create_sale(
  p_acting_as_user_id UUID,
  p_bar_id UUID,
  p_items JSONB,
  p_payment_method TEXT,
  p_status TEXT DEFAULT 'pending',
  p_server_id UUID DEFAULT NULL,  -- NEW PARAMETER for simplified mode
  p_customer_name TEXT DEFAULT NULL,
  p_customer_phone TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_business_date DATE DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  bar_id UUID,
  items JSONB,
  total NUMERIC,
  status TEXT,
  created_at TIMESTAMPTZ
) AS $$
DECLARE
  v_sale_id UUID;
  v_subtotal DECIMAL := 0;
  v_discount_total DECIMAL := 0;
  v_total DECIMAL := 0;
  v_item JSONB;
  v_business_date DATE;
  v_closing_hour INTEGER;
  v_caller_id UUID := auth.uid();
BEGIN
  -- Verify super_admin can proxy this action
  PERFORM _verify_super_admin_proxy(p_acting_as_user_id, 'CREATE_SALE');

  -- Calculate business_date
  IF p_business_date IS NOT NULL THEN
    v_business_date := p_business_date;
  ELSE
    SELECT closing_hour INTO v_closing_hour FROM bars WHERE id = p_bar_id;
    v_closing_hour := COALESCE(v_closing_hour, 6);
    v_business_date := DATE(NOW() - (v_closing_hour || ' hours')::INTERVAL);
  END IF;

  -- Calculate totals from items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_subtotal := v_subtotal + COALESCE((v_item->>'original_unit_price')::DECIMAL, (v_item->>'unit_price')::DECIMAL) * (v_item->>'quantity')::INT;
    v_discount_total := v_discount_total + COALESCE((v_item->>'discount_amount')::DECIMAL, 0);
  END LOOP;

  v_total := v_subtotal - v_discount_total;

  -- Create the sale
  INSERT INTO sales (
    bar_id, items, subtotal, discount_total, total, status,
    sold_by, server_id, created_by, customer_name, customer_phone, notes,
    business_date, payment_method
  ) VALUES (
    p_bar_id, p_items, v_subtotal, v_discount_total, v_total, p_status,
    p_acting_as_user_id, p_server_id, p_acting_as_user_id, p_customer_name, p_customer_phone, p_notes,
    v_business_date, p_payment_method
  )
  RETURNING sales.id INTO v_sale_id;

  -- Decrement stock for each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    UPDATE bar_products
    SET stock = stock - (v_item->>'quantity')::INT
    WHERE id = (v_item->>'product_id')::UUID;
  END LOOP;

  -- Log proxy action
  INSERT INTO audit_logs (
    event, severity, user_id, user_name, user_role, description, metadata, bar_id
  ) VALUES (
    'PROXY_SALE_CREATED',
    'warning',
    v_caller_id,
    (SELECT name FROM users WHERE id = v_caller_id LIMIT 1),
    'super_admin',
    'Superadmin created sale as user: ' || (SELECT name FROM users WHERE id = p_acting_as_user_id LIMIT 1),
    jsonb_build_object(
      'acting_as_user_id', p_acting_as_user_id,
      'sale_id', v_sale_id,
      'server_id', p_server_id,
      'total', v_total
    ),
    p_bar_id
  );

  -- Return the created sale
  RETURN QUERY
  SELECT
    sales.id,
    sales.bar_id,
    sales.items,
    sales.total,
    sales.status,
    sales.created_at
  FROM sales
  WHERE id = v_sale_id;

EXCEPTION WHEN OTHERS THEN
  INSERT INTO audit_logs (
    event, severity, user_id, user_name, user_role, description, metadata, bar_id
  ) VALUES (
    'PROXY_SALE_ERROR',
    'error',
    v_caller_id,
    (SELECT name FROM users WHERE id = v_caller_id LIMIT 1),
    'super_admin',
    'Error creating sale as user: ' || SQLERRM,
    jsonb_build_object('acting_as_user_id', p_acting_as_user_id),
    p_bar_id
  );
  RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION admin_as_create_sale(UUID, UUID, JSONB, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, DATE) TO authenticated;
COMMENT ON FUNCTION admin_as_create_sale IS 'Proxy: Create sale as another user. New parameter p_server_id tracks which server (in simplified mode) performed the sale.';

COMMIT;
