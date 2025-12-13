-- =====================================================
-- CENTRALIZED IMPERSONATION SECURITY
-- Refactoring: Create helper function and consolidate RPC logic
-- =====================================================

-- 1. Create helper function for centralized security logic
-- This function verifies super_admin status if impersonating
-- and returns the target user ID to use in queries
DROP FUNCTION IF EXISTS _get_target_user_id(UUID);

CREATE OR REPLACE FUNCTION _get_target_user_id(p_impersonating_user_id UUID)
RETURNS UUID AS $$
DECLARE
  v_current_user_id UUID;
  v_current_user_role TEXT;
BEGIN
  -- Get current user ID and role
  v_current_user_id := auth.uid();

  -- If no current user, raise exception
  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get current user's role
  SELECT role INTO v_current_user_role FROM users WHERE id = v_current_user_id;

  -- If impersonating, verify super_admin status
  IF p_impersonating_user_id IS NOT NULL THEN
    IF v_current_user_role != 'super_admin' THEN
      RAISE EXCEPTION 'Access denied: Only super_admin can impersonate';
    END IF;
    RETURN p_impersonating_user_id;
  END IF;

  -- Return current user ID if not impersonating
  RETURN v_current_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION _get_target_user_id(UUID) IS 'Helper function that centralizes impersonation security logic. Returns the target user ID to use in RPC queries.';

-- =====================================================
-- 2. Refactor get_user_bars to use helper function
-- =====================================================
DROP FUNCTION IF EXISTS get_user_bars(UUID);
DROP FUNCTION IF EXISTS get_user_bars(UUID, UUID);

CREATE OR REPLACE FUNCTION get_user_bars(p_user_id UUID, p_impersonating_user_id UUID DEFAULT NULL)
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
DECLARE
  v_target_user_id UUID;
BEGIN
  -- Use helper to get target user ID (with security verification)
  v_target_user_id := _get_target_user_id(p_impersonating_user_id);

  -- If p_user_id is provided and not impersonating, use it; otherwise use target
  IF p_impersonating_user_id IS NOT NULL THEN
    v_target_user_id := p_impersonating_user_id;
  ELSE
    v_target_user_id := p_user_id;
  END IF;

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
  WHERE bm.user_id = v_target_user_id
  AND bm.is_active = true
  AND b.is_active = true
  ORDER BY b.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_user_bars(UUID, UUID) TO authenticated;
COMMENT ON FUNCTION get_user_bars(UUID, UUID) IS 'Get bars for a user, with optional impersonation support.';

-- =====================================================
-- 3. Refactor get_bar_members to use helper function
-- =====================================================
DROP FUNCTION IF EXISTS get_bar_members(UUID);
DROP FUNCTION IF EXISTS get_bar_members(UUID, UUID);

CREATE OR REPLACE FUNCTION get_bar_members(p_bar_id UUID, p_impersonating_user_id UUID DEFAULT NULL)
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
  -- Verify impersonation if requested (using helper)
  IF p_impersonating_user_id IS NOT NULL THEN
    PERFORM _get_target_user_id(p_impersonating_user_id);
  END IF;

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

GRANT EXECUTE ON FUNCTION get_bar_members(UUID, UUID) TO authenticated;
COMMENT ON FUNCTION get_bar_members(UUID, UUID) IS 'Get bar members with optional impersonation support.';

-- =====================================================
-- 4. Refactor get_bar_products to use helper function
-- =====================================================
DROP FUNCTION IF EXISTS get_bar_products(UUID);
DROP FUNCTION IF EXISTS get_bar_products(UUID, UUID);

CREATE OR REPLACE FUNCTION get_bar_products(p_bar_id UUID, p_impersonating_user_id UUID DEFAULT NULL)
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
  -- Verify impersonation if requested (using helper)
  IF p_impersonating_user_id IS NOT NULL THEN
    PERFORM _get_target_user_id(p_impersonating_user_id);
  END IF;

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

GRANT EXECUTE ON FUNCTION get_bar_products(UUID, UUID) TO authenticated;
COMMENT ON FUNCTION get_bar_products(UUID, UUID) IS 'Get bar products with optional impersonation support.';

-- =====================================================
-- 5. Create get_my_bars for non-impersonation queries
-- =====================================================
DROP FUNCTION IF EXISTS get_my_bars();

CREATE OR REPLACE FUNCTION get_my_bars()
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
  WHERE bm.user_id = auth.uid()
  AND bm.is_active = true
  AND b.is_active = true
  ORDER BY b.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_my_bars() TO authenticated;
COMMENT ON FUNCTION get_my_bars() IS 'Get bars for the current authenticated user (no impersonation).';
