-- Migration 20251215: Create Proxy Admin RPCs
-- Implements the "Acting As" impersonation architecture.
-- Superadmin can perform actions on behalf of another user.

-- 1. admin_as_create_sale
-- Allows a superadmin to create a sale on behalf of another user.
CREATE OR REPLACE FUNCTION admin_as_create_sale(
  p_acting_as_user_id UUID, -- The user we are acting as
  p_bar_id UUID,
  p_items JSONB,
  p_payment_method TEXT,
  p_status TEXT DEFAULT 'pending',
  p_customer_name TEXT DEFAULT NULL,
  p_customer_phone TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_business_date DATE DEFAULT NULL
)
RETURNS sales
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sale sales;
  v_item JSONB;
  v_subtotal DECIMAL := 0;
  v_discount_total DECIMAL := 0;
  v_total DECIMAL := 0;
  v_original_price DECIMAL;
  v_final_price DECIMAL;
  v_discount DECIMAL;
  v_business_date DATE;
  v_closing_hour INTEGER;
  v_caller_id UUID := auth.uid();
BEGIN
  -- 1. SECURITY CHECK: Ensure the person calling this is a super_admin
  IF NOT EXISTS (SELECT 1 FROM bar_members WHERE user_id = v_caller_id AND role = 'super_admin') THEN
    RAISE EXCEPTION 'Access Denied: Only a super_admin can perform this action.';
  END IF;

  -- 2. BUSINESS LOGIC (copied from create_sale_with_promotions)
  -- Calculate business_date with frontend priority
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
    v_original_price := COALESCE((v_item->>'original_unit_price')::DECIMAL, (v_item->>'unit_price')::DECIMAL) * (v_item->>'quantity')::INT;
    v_final_price := (v_item->>'total_price')::DECIMAL;
    v_discount := COALESCE((v_item->>'discount_amount')::DECIMAL, 0);
    v_subtotal := v_subtotal + v_original_price;
    v_discount_total := v_discount_total + v_discount;
  END LOOP;
  
  v_total := v_subtotal - v_discount_total;
  
  -- 3. Create the sale using the impersonated user's ID
  INSERT INTO sales (
    bar_id, items, subtotal, discount_total, total, payment_method, status,
    sold_by, created_by, customer_name, customer_phone, notes,
    validated_by, validated_at, business_date
  ) VALUES (
    p_bar_id, p_items, v_subtotal, v_discount_total, v_total, p_payment_method, p_status,
    p_acting_as_user_id, -- Impersonated user
    p_acting_as_user_id, -- Impersonated user
    p_customer_name, p_customer_phone, p_notes,
    CASE WHEN p_status = 'validated' THEN p_acting_as_user_id ELSE NULL END, -- Impersonated user
    CASE WHEN p_status = 'validated' THEN NOW() ELSE NULL END,
    v_business_date
  )
  RETURNING * INTO v_sale;
  
  -- 4. Record promotion applications
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF (v_item->>'promotion_id') IS NOT NULL AND (v_item->>'promotion_id') != 'null' AND COALESCE((v_item->>'discount_amount')::DECIMAL, 0) > 0 THEN
      INSERT INTO promotion_applications (
        bar_id, promotion_id, sale_id, product_id, quantity_sold, original_price,
        discounted_price, discount_amount, applied_by
      ) VALUES (
        p_bar_id, (v_item->>'promotion_id')::UUID, v_sale.id, (v_item->>'product_id')::UUID, (v_item->>'quantity')::INT,
        COALESCE((v_item->>'original_unit_price')::DECIMAL, (v_item->>'unit_price')::DECIMAL) * (v_item->>'quantity')::INT,
        (v_item->>'total_price')::DECIMAL, (v_item->>'discount_amount')::DECIMAL,
        p_acting_as_user_id -- Impersonated user
      );
      
      UPDATE promotions SET current_uses = current_uses + 1 WHERE id = (v_item->>'promotion_id')::UUID;
    END IF;
  END LOOP;
  
  -- 5. Decrement stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    UPDATE bar_products SET stock = stock - (v_item->>'quantity')::INT WHERE id = (v_item->>'product_id')::UUID;
  END LOOP;

  -- 6. AUDIT LOG
  INSERT INTO audit_logs (event, severity, user_id, user_name, user_role, description, metadata, bar_id)
  VALUES (
    'PROXY_SALE_CREATED',
    'warning', -- Warning because it's a privileged action
    v_caller_id,
    (SELECT name FROM users WHERE id = v_caller_id LIMIT 1),
    'super_admin',
    'Superadmin a créé une vente en tant que ' || (SELECT name FROM users WHERE id = p_acting_as_user_id LIMIT 1),
    jsonb_build_object(
      'acting_as_user_id', p_acting_as_user_id,
      'sale_id', v_sale.id
    ),
    p_bar_id
  );
  
  RETURN v_sale;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Erreur lors de la création de la vente proxy: %', SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_as_create_sale(UUID, UUID, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, DATE) TO authenticated;

COMMENT ON FUNCTION admin_as_create_sale IS 'Proxy function for superadmins to create a sale on behalf of another user.';
