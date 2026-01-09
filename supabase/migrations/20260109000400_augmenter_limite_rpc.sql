-- =====================================================
-- PHASE 1 : AUGMENTER LIMITE RPC get_bar_products
-- =====================================================
-- Migration: Augmenter limite par défaut et ajouter fetch_all
-- Date: 2026-01-09
-- Objectif: Permettre affichage de tous les produits (pas seulement 50)

BEGIN;

-- Supprimer TOUTES les anciennes versions de la fonction
DROP FUNCTION IF EXISTS public.get_bar_products(UUID);
DROP FUNCTION IF EXISTS public.get_bar_products(UUID, UUID);
DROP FUNCTION IF EXISTS public.get_bar_products(UUID, UUID, INT);
DROP FUNCTION IF EXISTS public.get_bar_products(UUID, UUID, INT, INT);
DROP FUNCTION IF EXISTS public.get_bar_products(UUID, UUID, INT, INT, BOOLEAN);

-- Créer la nouvelle fonction avec limite augmentée
CREATE FUNCTION public.get_bar_products(
    p_bar_id UUID,
    p_impersonating_user_id UUID DEFAULT NULL,
    p_limit INT DEFAULT 500,  -- ✨ AUGMENTÉ: 50 → 500
    p_offset INT DEFAULT 0,
    p_fetch_all BOOLEAN DEFAULT false  -- ✨ NOUVEAU: Option pour tout charger
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
    display_name TEXT,
    official_image TEXT,
    product_volume TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Si fetch_all = true, ignorer limit/offset
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
            COALESCE(bp.local_name, gp.name) as display_name,
            gp.official_image,
            COALESCE(bp.volume, gp.volume) as product_volume
        FROM bar_products bp
        LEFT JOIN global_products gp ON gp.id = bp.global_product_id
        WHERE bp.bar_id = p_bar_id
          AND bp.is_active = true
        ORDER BY bp.local_name;
    ELSE
        -- Pagination normale
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
            COALESCE(bp.local_name, gp.name) as display_name,
            gp.official_image,
            COALESCE(bp.volume, gp.volume) as product_volume
        FROM bar_products bp
        LEFT JOIN global_products gp ON gp.id = bp.global_product_id
        WHERE bp.bar_id = p_bar_id
          AND bp.is_active = true
        ORDER BY bp.local_name
        LIMIT p_limit OFFSET p_offset;
    END IF;
END;
$$;

-- Permissions
GRANT EXECUTE ON FUNCTION public.get_bar_products TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_bar_products TO service_role;

-- Commentaire
COMMENT ON FUNCTION public.get_bar_products IS 
'Récupère les produits d''un bar avec pagination.
Limite par défaut augmentée de 50 à 500 pour éviter problème d''affichage.
Paramètre p_fetch_all permet de charger TOUS les produits sans limite.';

COMMIT;
