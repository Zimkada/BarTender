-- Migration: Extend get_bar_products RPC to return initial_unit_cost and last_unit_cost
-- Description: Without this, the frontend mappers read null for these fields and getDisplayCost() cannot resolve them.
-- Date: 2026-03-31

BEGIN;

-- Drop all overloaded signatures to avoid ambiguity
DROP FUNCTION IF EXISTS public.get_bar_products(UUID);
DROP FUNCTION IF EXISTS public.get_bar_products(UUID, UUID);
DROP FUNCTION IF EXISTS public.get_bar_products(UUID, UUID, INT);
DROP FUNCTION IF EXISTS public.get_bar_products(UUID, UUID, INT, INT);
DROP FUNCTION IF EXISTS public.get_bar_products(UUID, UUID, INT, INT, BOOLEAN);

CREATE FUNCTION public.get_bar_products(
    p_bar_id UUID,
    p_impersonating_user_id UUID DEFAULT NULL, -- Conservé pour compatibilité API (utilisé par proxy admin)
    p_limit INT DEFAULT 500,
    p_offset INT DEFAULT 0,
    p_fetch_all BOOLEAN DEFAULT false
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
    volume TEXT,
    current_average_cost NUMERIC,
    initial_unit_cost NUMERIC,
    last_unit_cost NUMERIC,
    display_name TEXT,
    official_image TEXT,
    product_volume TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF p_fetch_all THEN
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
            bp.volume,
            bp.current_average_cost,
            bp.initial_unit_cost,
            bp.last_unit_cost,
            COALESCE(bp.local_name, gp.name) as display_name,
            gp.official_image,
            COALESCE(bp.volume, gp.volume) as product_volume
        FROM bar_products bp
        LEFT JOIN global_products gp ON gp.id = bp.global_product_id
        WHERE bp.bar_id = p_bar_id
          AND bp.is_active = true
        ORDER BY COALESCE(bp.local_name, gp.name);
    ELSE
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
            bp.volume,
            bp.current_average_cost,
            bp.initial_unit_cost,
            bp.last_unit_cost,
            COALESCE(bp.local_name, gp.name) as display_name,
            gp.official_image,
            COALESCE(bp.volume, gp.volume) as product_volume
        FROM bar_products bp
        LEFT JOIN global_products gp ON gp.id = bp.global_product_id
        WHERE bp.bar_id = p_bar_id
          AND bp.is_active = true
        ORDER BY COALESCE(bp.local_name, gp.name)
        LIMIT p_limit OFFSET p_offset;
    END IF;
END;
$$;

-- Permissions
GRANT EXECUTE ON FUNCTION public.get_bar_products TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_bar_products TO service_role;

COMMENT ON FUNCTION public.get_bar_products IS
'Récupère les produits d''un bar avec pagination.
Inclut initial_unit_cost (coût saisi manuellement) et last_unit_cost (dernier coût d''approvisionnement) pour l''affichage inventaire.';

COMMIT;
