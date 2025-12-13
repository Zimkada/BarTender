-- =====================================================
-- DEBUG: Test RPC with simpler auth check
-- =====================================================

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
  -- Always allow for now to test if RPC itself works
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

GRANT EXECUTE ON FUNCTION get_bar_products(UUID) TO authenticated;
