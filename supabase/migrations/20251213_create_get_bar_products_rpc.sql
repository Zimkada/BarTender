-- =====================================================
-- RPC: Get bar products bypassing RLS
-- For impersonation: allows super_admin to get bar products
-- =====================================================

CREATE OR REPLACE FUNCTION get_bar_products(p_bar_id UUID)
RETURNS TABLE (
  id UUID,
  bar_id UUID,
  global_product_id UUID,
  name TEXT,
  unit_price NUMERIC,
  volume NUMERIC,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ,
  category_id UUID,
  display_name TEXT,
  product_name TEXT,
  category_name TEXT
) AS $$
BEGIN
  -- Check if user is impersonating OR is bar member
  IF (auth.jwt()->'user_metadata'->>'impersonation' = 'true' OR
      EXISTS (SELECT 1 FROM bar_members WHERE user_id = auth.uid() AND bar_id = p_bar_id AND is_active = true)) THEN

    RETURN QUERY
    SELECT
      bp.id,
      bp.bar_id,
      bp.global_product_id,
      COALESCE(bp.name, gp.name, '') as name,
      bp.unit_price,
      bp.volume,
      bp.is_active,
      bp.created_at,
      bp.category_id,
      bp.display_name,
      gp.name,
      bc.name
    FROM bar_products bp
    LEFT JOIN global_products gp ON bp.global_product_id = gp.id
    LEFT JOIN bar_categories bc ON bp.category_id = bc.id
    WHERE bp.bar_id = p_bar_id
    AND bp.is_active = true
    ORDER BY bp.created_at DESC;
  ELSE
    RAISE EXCEPTION 'Unauthorized';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_bar_products(UUID) TO authenticated;

COMMENT ON FUNCTION get_bar_products(UUID) IS 'Get bar products with category info, bypassing RLS. Used during impersonation.';
