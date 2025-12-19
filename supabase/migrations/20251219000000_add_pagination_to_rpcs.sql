-- =====================================================
-- Phase 3.4.1: Add pagination (LIMIT/OFFSET) to RPC functions
-- Date: 2025-12-19
--
-- Adds LIMIT and OFFSET parameters to critical RPC functions
-- for efficient offset-based pagination
-- =====================================================

-- =====================================================
-- 1. UPDATE: get_bar_products() - Add pagination
-- =====================================================

DROP FUNCTION IF EXISTS get_bar_products(UUID);

CREATE OR REPLACE FUNCTION get_bar_products(
    p_bar_id UUID,
    p_impersonating_user_id UUID DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
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
  -- Check if user is impersonating OR is bar member
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
    ORDER BY bp.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
  ELSE
    RAISE EXCEPTION 'Unauthorized';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_bar_products(UUID, UUID, INTEGER, INTEGER) TO authenticated;

COMMENT ON FUNCTION get_bar_products(UUID, UUID, INTEGER, INTEGER) IS 'Get paginated bar products with category info. Parameters: bar_id, impersonating_user_id (optional), limit (default 50), offset (default 0)';

-- =====================================================
-- 2. UPDATE: admin_as_get_bar_sales() - Add pagination
-- =====================================================

CREATE OR REPLACE FUNCTION public.admin_as_get_bar_sales(
    p_acting_as_user_id UUID,
    p_bar_id UUID,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id UUID;
    v_is_super_admin BOOLEAN;
BEGIN
    -- 1. Verify Caller is Super Admin
    v_caller_id := auth.uid();

    -- Check role in bar_members
    SELECT EXISTS (
        SELECT 1 FROM public.bar_members
        WHERE user_id = v_caller_id
        AND role = 'super_admin'
        AND is_active = true
    ) INTO v_is_super_admin;

    IF NOT v_is_super_admin THEN
        RAISE EXCEPTION 'Access Denied: Only Super Admins can use this proxy function.';
    END IF;

    -- 2. Fetch Sales for the specified bar with pagination
    RETURN (
        SELECT COALESCE(jsonb_agg(
            to_jsonb(s) || jsonb_build_object(
                'seller_name', u.name,
                'validator_name', v.name,
                'items', COALESCE(s.items, '[]'::jsonb)
            )
            ORDER BY s.business_date DESC
        ), '[]'::jsonb)
        FROM public.sales s
        LEFT JOIN public.users u ON s.sold_by = u.id
        LEFT JOIN public.users v ON s.validated_by = v.id
        WHERE s.bar_id = p_bar_id
        LIMIT p_limit
        OFFSET p_offset
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_as_get_bar_sales(UUID, UUID, INTEGER, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.admin_as_get_bar_sales(UUID, UUID, INTEGER, INTEGER) IS 'Get paginated bar sales as super admin. Parameters: acting_as_user_id, bar_id, limit (default 50), offset (default 0)';

-- =====================================================
-- 3. New RPC: get_supplies_paginated()
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_supplies_paginated(
    p_bar_id UUID,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    bar_id UUID,
    product_id UUID,
    quantity INTEGER,
    lot_price NUMERIC,
    lot_size INTEGER,
    unit_cost NUMERIC,
    supplier TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    display_name TEXT
) AS $$
BEGIN
    -- Verify user is bar member
    IF NOT EXISTS (SELECT 1 FROM bar_members WHERE user_id = auth.uid() AND bar_id = p_bar_id AND is_active = true) THEN
        RAISE EXCEPTION 'Unauthorized: User is not a member of this bar';
    END IF;

    RETURN QUERY
    SELECT
        s.id,
        s.bar_id,
        s.product_id,
        s.quantity,
        s.lot_price,
        s.lot_size,
        s.unit_cost,
        s.supplier,
        s.created_by,
        s.created_at,
        s.updated_at,
        bp.display_name
    FROM public.supplies s
    LEFT JOIN public.bar_products bp ON s.product_id = bp.id
    WHERE s.bar_id = p_bar_id
    ORDER BY s.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_supplies_paginated(UUID, INTEGER, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.get_supplies_paginated(UUID, INTEGER, INTEGER) IS 'Get paginated supplies for a bar. Parameters: bar_id, limit (default 50), offset (default 0)';

-- =====================================================
-- 4. New RPC: get_consignments_paginated()
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_consignments_paginated(
    p_bar_id UUID,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    bar_id UUID,
    product_id UUID,
    quantity INTEGER,
    status TEXT,
    supplier_name TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    display_name TEXT
) AS $$
BEGIN
    -- Verify user is bar member
    IF NOT EXISTS (SELECT 1 FROM bar_members WHERE user_id = auth.uid() AND bar_id = p_bar_id AND is_active = true) THEN
        RAISE EXCEPTION 'Unauthorized: User is not a member of this bar';
    END IF;

    RETURN QUERY
    SELECT
        c.id,
        c.bar_id,
        c.product_id,
        c.quantity,
        c.status,
        c.supplier_name,
        c.created_at,
        c.updated_at,
        bp.display_name
    FROM public.consignments c
    LEFT JOIN public.bar_products bp ON c.product_id = bp.id
    WHERE c.bar_id = p_bar_id
    ORDER BY c.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_consignments_paginated(UUID, INTEGER, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.get_consignments_paginated(UUID, INTEGER, INTEGER) IS 'Get paginated consignments for a bar. Parameters: bar_id, limit (default 50), offset (default 0)';
