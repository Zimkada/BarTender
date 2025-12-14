-- =====================================================
-- COMPLETE PROXY ADMIN ARCHITECTURE
-- Superadmin "Acting As" mode for seamless impersonation
-- =====================================================

-- 1. Helper function for proxy admin verification
-- Ensures only super_admin can act as another user
DROP FUNCTION IF EXISTS _verify_super_admin_proxy(UUID, TEXT);

CREATE OR REPLACE FUNCTION _verify_super_admin_proxy(p_acting_as_user_id UUID, p_action TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role TEXT;
BEGIN
  -- Get caller's role from bar_members (first super_admin role found)
  SELECT role INTO v_caller_role FROM bar_members
  WHERE user_id = v_caller_id AND role = 'super_admin'
  LIMIT 1;

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Access Denied: Only super_admin can perform proxy action "%"', p_action;
  END IF;

  -- Verify acting_as_user_id exists and is active
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_acting_as_user_id AND is_active = true) THEN
    RAISE EXCEPTION 'Invalid user: Target user does not exist or is inactive';
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION _verify_super_admin_proxy IS 'Helper to verify super_admin proxy permissions and log intent';

-- =====================================================
-- PROXY READ FUNCTIONS (GET)
-- =====================================================

-- 1. admin_as_get_bar_products - Get products as another user
DROP FUNCTION IF EXISTS admin_as_get_bar_products(UUID, UUID);

CREATE OR REPLACE FUNCTION admin_as_get_bar_products(
  p_acting_as_user_id UUID,
  p_bar_id UUID
)
RETURNS TABLE (
  id UUID,
  bar_id UUID,
  global_product_id UUID,
  local_name TEXT,
  local_image TEXT,
  local_category_id UUID,
  price NUMERIC,
  stock INTEGER,
  alert_threshold INTEGER,
  is_custom_product BOOLEAN,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  volume TEXT,
  display_name TEXT,
  global_product_name TEXT,
  category_name TEXT
) AS $$
BEGIN
  -- Verify super_admin can proxy this action
  PERFORM _verify_super_admin_proxy(p_acting_as_user_id, 'GET_BAR_PRODUCTS');

  -- Log proxy access
  INSERT INTO audit_logs (
    event, severity, user_id, user_name, user_role, description, metadata, bar_id
  ) VALUES (
    'PROXY_GET_PRODUCTS',
    'info',
    auth.uid(),
    (SELECT name FROM users WHERE id = auth.uid() LIMIT 1),
    'super_admin',
    'Superadmin accessed products as user: ' || (SELECT name FROM users WHERE id = p_acting_as_user_id LIMIT 1),
    jsonb_build_object('acting_as_user_id', p_acting_as_user_id),
    p_bar_id
  );

  RETURN QUERY
  SELECT
    bp.id,
    bp.bar_id,
    bp.global_product_id,
    bp.local_name,
    bp.local_image,
    bp.local_category_id,
    bp.price,
    bp.stock,
    bp.alert_threshold,
    bp.is_custom_product,
    bp.is_active,
    bp.created_at,
    bp.updated_at,
    bp.volume,
    bp.display_name,
    gp.name,
    bc.name
  FROM bar_products bp
  LEFT JOIN global_products gp ON bp.global_product_id = gp.id
  LEFT JOIN bar_categories bc ON bp.local_category_id = bc.id
  WHERE bp.bar_id = p_bar_id
  AND bp.is_active = true
  ORDER BY bp.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION admin_as_get_bar_products(UUID, UUID) TO authenticated;
COMMENT ON FUNCTION admin_as_get_bar_products IS 'Proxy: Get bar products as another user (audit logged)';

-- 2. admin_as_get_bar_members - Get members as another user
DROP FUNCTION IF EXISTS admin_as_get_bar_members(UUID, UUID);

CREATE OR REPLACE FUNCTION admin_as_get_bar_members(
  p_acting_as_user_id UUID,
  p_bar_id UUID
)
RETURNS TABLE (
  id UUID,
  bar_id UUID,
  user_id UUID,
  role TEXT,
  is_active BOOLEAN,
  assigned_by UUID,
  assigned_at TIMESTAMPTZ,
  user_name TEXT,
  user_email TEXT,
  user_phone TEXT
) AS $$
BEGIN
  -- Verify super_admin can proxy this action
  PERFORM _verify_super_admin_proxy(p_acting_as_user_id, 'GET_BAR_MEMBERS');

  -- Log proxy access
  INSERT INTO audit_logs (
    event, severity, user_id, user_name, user_role, description, metadata, bar_id
  ) VALUES (
    'PROXY_GET_MEMBERS',
    'info',
    auth.uid(),
    (SELECT name FROM users WHERE id = auth.uid() LIMIT 1),
    'super_admin',
    'Superadmin accessed members as user: ' || (SELECT name FROM users WHERE id = p_acting_as_user_id LIMIT 1),
    jsonb_build_object('acting_as_user_id', p_acting_as_user_id),
    p_bar_id
  );

  RETURN QUERY
  SELECT
    bm.id,
    bm.bar_id,
    bm.user_id,
    bm.role,
    bm.is_active,
    bm.assigned_by,
    bm.assigned_at,
    u.name,
    u.email,
    u.phone
  FROM bar_members bm
  LEFT JOIN users u ON bm.user_id = u.id
  WHERE bm.bar_id = p_bar_id
  AND bm.is_active = true
  ORDER BY u.name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION admin_as_get_bar_members(UUID, UUID) TO authenticated;
COMMENT ON FUNCTION admin_as_get_bar_members IS 'Proxy: Get bar members as another user (audit logged)';

-- 3. admin_as_get_user_bars - Get bars for a user
DROP FUNCTION IF EXISTS admin_as_get_user_bars(UUID, UUID);

CREATE OR REPLACE FUNCTION admin_as_get_user_bars(
  p_acting_as_user_id UUID
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  address TEXT,
  phone TEXT,
  owner_id UUID,
  created_at TIMESTAMPTZ,
  is_active BOOLEAN,
  closing_hour INT,
  settings JSONB
) AS $$
BEGIN
  -- Verify super_admin can proxy this action
  PERFORM _verify_super_admin_proxy(p_acting_as_user_id, 'GET_USER_BARS');

  -- Log proxy access
  INSERT INTO audit_logs (
    event, severity, user_id, user_name, user_role, description, metadata
  ) VALUES (
    'PROXY_GET_USER_BARS',
    'info',
    auth.uid(),
    (SELECT name FROM users WHERE id = auth.uid() LIMIT 1),
    'super_admin',
    'Superadmin accessed bars as user: ' || (SELECT name FROM users WHERE id = p_acting_as_user_id LIMIT 1),
    jsonb_build_object('acting_as_user_id', p_acting_as_user_id)
  );

  RETURN QUERY
  SELECT DISTINCT
    b.id,
    b.name,
    b.address,
    b.phone,
    b.owner_id,
    b.created_at,
    b.is_active,
    b.closing_hour,
    b.settings
  FROM bars b
  INNER JOIN bar_members bm ON b.id = bm.bar_id
  WHERE bm.user_id = p_acting_as_user_id
  AND bm.is_active = true
  AND b.is_active = true
  ORDER BY b.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION admin_as_get_user_bars(UUID) TO authenticated;
COMMENT ON FUNCTION admin_as_get_user_bars IS 'Proxy: Get bars for a user as super_admin (audit logged)';

-- =====================================================
-- PROXY WRITE FUNCTIONS (CREATE, UPDATE, DELETE)
-- =====================================================

-- 4. admin_as_create_sale - Create sale as another user (IMPROVED)
DROP FUNCTION IF EXISTS admin_as_create_sale(UUID, UUID, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, DATE);

CREATE OR REPLACE FUNCTION admin_as_create_sale(
  p_acting_as_user_id UUID,
  p_bar_id UUID,
  p_items JSONB,
  p_payment_method TEXT,
  p_status TEXT DEFAULT 'pending',
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
    sold_by, created_by, customer_name, customer_phone, notes,
    business_date
  ) VALUES (
    p_bar_id, p_items, v_subtotal, v_discount_total, v_total, p_status,
    p_acting_as_user_id, p_acting_as_user_id, p_customer_name, p_customer_phone, p_notes,
    v_business_date
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
      'total', v_total
    ),
    p_bar_id
  );

  RETURN QUERY
  SELECT
    v_sale_id,
    p_bar_id,
    p_items,
    v_total,
    p_status,
    NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION admin_as_create_sale(UUID, UUID, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, DATE) TO authenticated;
COMMENT ON FUNCTION admin_as_create_sale IS 'Proxy: Create a sale as another user (audit logged)';

-- 5. admin_as_update_stock - Update product stock as admin
DROP FUNCTION IF EXISTS admin_as_update_stock(UUID, UUID, INTEGER);

CREATE OR REPLACE FUNCTION admin_as_update_stock(
  p_acting_as_user_id UUID,
  p_product_id UUID,
  p_quantity_change INTEGER
)
RETURNS TABLE (
  product_id UUID,
  new_stock INTEGER,
  updated_at TIMESTAMPTZ
) AS $$
DECLARE
  v_new_stock INTEGER;
  v_bar_id UUID;
BEGIN
  -- Verify super_admin can proxy this action
  PERFORM _verify_super_admin_proxy(p_acting_as_user_id, 'UPDATE_STOCK');

  -- Get bar_id from product
  SELECT bar_id INTO v_bar_id FROM bar_products WHERE id = p_product_id;

  -- Update stock
  UPDATE bar_products
  SET stock = stock + p_quantity_change
  WHERE id = p_product_id
  RETURNING stock INTO v_new_stock;

  -- Log proxy action
  INSERT INTO audit_logs (
    event, severity, user_id, user_name, user_role, description, metadata, bar_id
  ) VALUES (
    'PROXY_STOCK_UPDATED',
    'info',
    auth.uid(),
    (SELECT name FROM users WHERE id = auth.uid() LIMIT 1),
    'super_admin',
    'Superadmin updated stock as user: ' || (SELECT name FROM users WHERE id = p_acting_as_user_id LIMIT 1),
    jsonb_build_object(
      'acting_as_user_id', p_acting_as_user_id,
      'product_id', p_product_id,
      'quantity_change', p_quantity_change,
      'new_stock', v_new_stock
    ),
    v_bar_id
  );

  RETURN QUERY
  SELECT p_product_id, v_new_stock, NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION admin_as_update_stock(UUID, UUID, INTEGER) TO authenticated;
COMMENT ON FUNCTION admin_as_update_stock IS 'Proxy: Update product stock as another user (audit logged)';

-- =====================================================
-- AUDIT CLEANUP: Ensure audit_logs table ready
-- =====================================================

-- Ensure audit_logs has all necessary columns
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS related_entity_id UUID DEFAULT NULL;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS related_entity_type TEXT DEFAULT NULL;

-- Create index for faster proxy admin queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_proxy_events
  ON audit_logs(event)
  WHERE event LIKE 'PROXY_%';

CREATE INDEX IF NOT EXISTS idx_audit_logs_super_admin
  ON audit_logs(user_id)
  WHERE user_role = 'super_admin';
