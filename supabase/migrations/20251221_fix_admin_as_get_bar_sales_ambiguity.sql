-- Migration: Fix PGRST203 ambiguous function error
-- Purpose: Remove duplicate/conflicting admin_as_get_bar_sales functions
-- Problem: PostgreSQL found multiple function signatures with same name but different parameters

BEGIN;

-- Drop all versions of the function first
DROP FUNCTION IF EXISTS public.admin_as_get_bar_sales(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.admin_as_get_bar_sales(UUID, UUID, INTEGER, INTEGER) CASCADE;

-- Create the ONLY correct version with pagination support
-- This function has optional LIMIT/OFFSET parameters with defaults
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

COMMENT ON FUNCTION public.admin_as_get_bar_sales(UUID, UUID, INTEGER, INTEGER) IS
'Get paginated bar sales as super admin. Parameters: acting_as_user_id, bar_id, limit (default 50), offset (default 0)';

COMMIT;
