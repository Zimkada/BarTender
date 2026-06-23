-- =====================================================
-- HOTFIX — get_bar_products : lever l'ambiguïté de surcharge + vrai guard
-- =====================================================
-- Date : 2026-06-23
--
-- BUG INTRODUIT PAR LA VAGUE 1 (20260623190359) :
--   La Vague 1 a recréé une surcharge get_bar_products(uuid,uuid,int,int) [4-params,
--   17 colonnes] en se basant sur le corps obsolète de 20251219000000. Or la version
--   ACTIVE en prod depuis 20260331000002 est get_bar_products(uuid,uuid,int,int,bool)
--   [5-params, 20 colonnes, p_fetch_all]. Les deux ont coexisté → l'appel client à
--   4 arguments est devenu AMBIGU :
--     ERROR 42725: function get_bar_products(uuid, unknown, integer, integer) is not unique
--   → l'app ne charge plus les produits (ProductsService.getBarProducts).
--
-- De plus, le « durcissement » Vague 1 ne s'est jamais appliqué à la vraie fonction :
--   la 5-params active (20260331000002) n'a AUCUN guard (SECURITY DEFINER ouvert).
--
-- CORRECTIF :
--   1. DROP la surcharge 4-params parasite (créée par erreur en Vague 1, jamais la
--      bonne : colonnes incomplètes + signature obsolète).
--   2. Recréer la 5-params ACTIVE à l'identique (corps + 20 colonnes de 20260331000002)
--      en y AJOUTANT le guard is_bar_member(p_bar_id) OR owner OR is_super_admin.
--      → débloque l'app ET applique enfin le durcissement prévu en Vague 1.
--
-- Le client appelle 4 args (products.service.ts) → résolus vers la 5-params (p_fetch_all
--   DEFAULT false). p_fetch_all n'est utilisé par aucun appelant client (vérifié) mais
--   conservé pour ne pas changer la signature/les types générés.
-- =====================================================

BEGIN;

-- 1. Supprimer la surcharge 4-params parasite introduite par la Vague 1.
DROP FUNCTION IF EXISTS public.get_bar_products(uuid, uuid, integer, integer);

-- 2. Recréer la 5-params active (corps de 20260331000002) + guard membre/owner/super_admin.
CREATE OR REPLACE FUNCTION public.get_bar_products(
    p_bar_id UUID,
    p_impersonating_user_id UUID DEFAULT NULL, -- Conservé pour compatibilité API
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
    -- 🛡️ Membre actif du bar, propriétaire, ou super_admin.
    -- (Cohérent avec get_bar_members / Vague 3. La branche owner couvre le promoteur
    --  dont le compte ne serait pas — ou plus — dans bar_members.)
    IF NOT (
        is_bar_member(p_bar_id)
        OR EXISTS (SELECT 1 FROM public.bars b WHERE b.id = p_bar_id AND b.owner_id = auth.uid())
        OR is_super_admin()
    ) THEN
        RAISE EXCEPTION 'Access denied: not a member of this bar' USING ERRCODE = '42501';
    END IF;

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

-- Privilèges : fermer PUBLIC/anon, garder authenticated (le guard fait le reste).
REVOKE EXECUTE ON FUNCTION public.get_bar_products(uuid, uuid, integer, integer, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_bar_products(uuid, uuid, integer, integer, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_bar_products(uuid, uuid, integer, integer, boolean) TO authenticated;

COMMENT ON FUNCTION public.get_bar_products(uuid, uuid, integer, integer, boolean) IS
'Produits d''un bar (20 colonnes). Guard membre/owner/super_admin + hotfix ambiguïté de surcharge 2026-06-23.';

COMMIT;
