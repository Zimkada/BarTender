-- =====================================================
-- MIGRATION 20251216070000: Add official_image to get_bar_products RPC
-- Date: 2025-12-16 07:00:00
-- Description: Fix Issue #13 - Images globales non affichées pour les bars
-- =====================================================

-- =====================================================
-- ISSUE #13: Images des produits globaux non affichées
-- Problème: La RPC get_bar_products ne retourne pas official_image
-- Impact: Les bars ne voient jamais les images du catalogue global
-- Solution: Ajouter official_image à la RPC et au frontend
-- =====================================================

-- Drop and recreate get_bar_products with official_image
DROP FUNCTION IF EXISTS get_bar_products(UUID, UUID);

CREATE OR REPLACE FUNCTION get_bar_products(p_bar_id UUID, p_impersonating_user_id UUID DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  bar_id UUID,
  global_product_id UUID,
  local_name TEXT,
  local_image TEXT,
  official_image TEXT,  -- NOUVEAU: Ajout de l'image globale
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
    gp.official_image,  -- NOUVEAU: Récupération de l'image globale
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
COMMENT ON FUNCTION get_bar_products(UUID, UUID) IS 'Get bar products with official_image from global catalog. Priority: local_image > official_image > null';

-- =====================================================
-- Update admin_as_get_bar_products (Proxy Admin)
-- =====================================================

DROP FUNCTION IF EXISTS admin_as_get_bar_products(UUID, UUID);

CREATE OR REPLACE FUNCTION admin_as_get_bar_products(
  p_acting_user_id UUID,
  p_bar_id UUID
)
RETURNS TABLE (
  id UUID,
  bar_id UUID,
  global_product_id UUID,
  local_name TEXT,
  local_image TEXT,
  official_image TEXT,  -- NOUVEAU: Ajout de l'image globale
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
DECLARE
  v_is_super_admin BOOLEAN;
BEGIN
  -- Verify caller is super_admin
  SELECT is_super_admin() INTO v_is_super_admin;

  IF NOT v_is_super_admin THEN
    RAISE EXCEPTION 'Access denied: super_admin role required';
  END IF;

  RETURN QUERY
  SELECT
    bp.id,
    bp.bar_id,
    bp.global_product_id,
    bp.local_name,
    bp.local_image,
    gp.official_image,  -- NOUVEAU: Récupération de l'image globale
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
COMMENT ON FUNCTION admin_as_get_bar_products(UUID, UUID) IS 'Proxy Admin: Get bar products with official_image. Requires super_admin role.';
