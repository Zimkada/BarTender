-- =====================================================
-- FIX: Recreate all impersonation RPCs with correct columns
-- =====================================================

-- 1. Fix get_user_bars
DROP FUNCTION IF EXISTS get_user_bars(UUID);

CREATE OR REPLACE FUNCTION get_user_bars(p_user_id UUID)
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
  IF (auth.jwt()->'user_metadata'->>'impersonation' = 'true' OR
      EXISTS (SELECT 1 FROM bar_members bm_check WHERE bm_check.user_id = auth.uid() AND bm_check.is_active = true)) THEN
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
    WHERE bm.user_id = p_user_id
    AND bm.is_active = true
    AND b.is_active = true;
  ELSE
    RAISE EXCEPTION 'Unauthorized';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_user_bars(UUID) TO authenticated;

-- 2. Fix get_bar_members
DROP FUNCTION IF EXISTS get_bar_members(UUID);

CREATE OR REPLACE FUNCTION get_bar_members(p_bar_id UUID)
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
  IF (auth.jwt()->'user_metadata'->>'impersonation' = 'true' OR
      EXISTS (SELECT 1 FROM bar_members bm_check WHERE bm_check.user_id = auth.uid() AND bm_check.bar_id = p_bar_id AND bm_check.is_active = true)) THEN
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
  ELSE
    RAISE EXCEPTION 'Unauthorized';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_bar_members(UUID) TO authenticated;

-- 3. Fix get_bar_products
DROP FUNCTION IF EXISTS get_bar_products(UUID);

CREATE OR REPLACE FUNCTION get_bar_products(p_bar_id UUID)
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
  IF (auth.jwt()->'user_metadata'->>'impersonation' = 'true' OR
      EXISTS (SELECT 1 FROM bar_members bm_check WHERE bm_check.user_id = auth.uid() AND bm_check.bar_id = p_bar_id AND bm_check.is_active = true)) THEN
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
  ELSE
    RAISE EXCEPTION 'Unauthorized';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_bar_products(UUID) TO authenticated;
