-- =====================================================
-- Phase 3.4.2: Add cursor-based pagination for sales
-- Date: 2025-12-19
--
-- Implements efficient cursor-based pagination using (business_date, id) composite key
-- Better than offset for large datasets and real-time data changes
-- =====================================================

-- =====================================================
-- 1. New RPC: admin_as_get_bar_sales_cursor()
-- =====================================================

CREATE OR REPLACE FUNCTION public.admin_as_get_bar_sales_cursor(
    p_acting_as_user_id UUID,
    p_bar_id UUID,
    p_limit INTEGER DEFAULT 50,
    p_cursor_date TIMESTAMPTZ DEFAULT NULL,
    p_cursor_id UUID DEFAULT NULL
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

    -- 2. Fetch Sales using cursor pagination
    -- Cursor is based on (business_date, id) composite key
    -- This ensures stable pagination even if data changes between requests
    RETURN (
        SELECT COALESCE(jsonb_agg(
            to_jsonb(s) || jsonb_build_object(
                'seller_name', u.name,
                'validator_name', v.name,
                'items', COALESCE(s.items, '[]'::jsonb),
                'cursor', json_build_object(
                    'date', s.business_date,
                    'id', s.id
                )
            )
            ORDER BY s.business_date DESC, s.id DESC
        ), '[]'::jsonb)
        FROM public.sales s
        LEFT JOIN public.users u ON s.sold_by = u.id
        LEFT JOIN public.users v ON s.validated_by = v.id
        WHERE s.bar_id = p_bar_id
        AND (
            -- If no cursor provided, get first page
            (p_cursor_date IS NULL AND p_cursor_id IS NULL)
            OR
            -- Otherwise, get next page after cursor
            -- Use composite key comparison: (business_date, id) < (p_cursor_date, p_cursor_id)
            (s.business_date, s.id) < (p_cursor_date, p_cursor_id)
        )
        LIMIT p_limit
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_as_get_bar_sales_cursor(UUID, UUID, INTEGER, TIMESTAMPTZ, UUID) TO authenticated;

COMMENT ON FUNCTION public.admin_as_get_bar_sales_cursor(UUID, UUID, INTEGER, TIMESTAMPTZ, UUID) IS
'Get paginated bar sales using cursor-based pagination. More efficient than offset for large datasets. Parameters: acting_as_user_id, bar_id, limit (default 50), cursor_date (null for first page), cursor_id (null for first page)';

-- =====================================================
-- 2. New RPC: get_bar_sales_cursor()
-- Direct cursor pagination without RLS bypass (for bar members)
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_bar_sales_cursor(
    p_bar_id UUID,
    p_limit INTEGER DEFAULT 50,
    p_cursor_date TIMESTAMPTZ DEFAULT NULL,
    p_cursor_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    bar_id UUID,
    items JSONB,
    total NUMERIC,
    payment_method TEXT,
    sold_by UUID,
    created_by UUID,
    validated_by UUID,
    status TEXT,
    business_date DATE,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    seller_name TEXT,
    validator_name TEXT,
    cursor_date TIMESTAMPTZ,
    cursor_id UUID
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
        s.items,
        s.total,
        s.payment_method,
        s.sold_by,
        s.created_by,
        s.validated_by,
        s.status,
        s.business_date,
        s.created_at,
        s.updated_at,
        u.name,
        v.name,
        s.business_date,
        s.id
    FROM public.sales s
    LEFT JOIN public.users u ON s.sold_by = u.id
    LEFT JOIN public.users v ON s.validated_by = v.id
    WHERE s.bar_id = p_bar_id
    AND (
        -- If no cursor provided, get first page
        (p_cursor_date IS NULL AND p_cursor_id IS NULL)
        OR
        -- Otherwise, get next page after cursor
        (s.business_date, s.id) < (p_cursor_date, p_cursor_id)
    )
    ORDER BY s.business_date DESC, s.id DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_bar_sales_cursor(UUID, INTEGER, TIMESTAMPTZ, UUID) TO authenticated;

COMMENT ON FUNCTION public.get_bar_sales_cursor(UUID, INTEGER, TIMESTAMPTZ, UUID) IS
'Get paginated bar sales using cursor-based pagination for bar members. Parameters: bar_id, limit (default 50), cursor_date (null for first page), cursor_id (null for first page)';

-- =====================================================
-- 3. Index optimization for cursor pagination
-- =====================================================

-- Ensure composite index on (business_date, id) for efficient cursor pagination
-- This index should already exist but we verify it
CREATE INDEX IF NOT EXISTS idx_sales_business_date_id ON public.sales(bar_id, business_date DESC, id DESC);

COMMENT ON INDEX idx_sales_business_date_id IS 'Composite index for efficient cursor-based pagination on sales';
