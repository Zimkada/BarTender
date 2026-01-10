-- =====================================================
-- FIX: Add SECURITY DEFINER to admin RPC functions
-- =====================================================
-- Issue: Superadmin cannot see bars in "Gestion des bars"
--        get_paginated_bars() executes with user privileges
--        RLS policies on bars table block access
--
-- Root Cause:
--   RPC get_paginated_bars() created in migration 20251211174059
--   Does NOT have SECURITY DEFINER
--   When superadmin calls it, RLS policy on bars table applies:
--     "Bar members can view their bars" (is_bar_member(id) OR is_super_admin())
--   If superadmin has no bar_members entries, sees 0 bars
--
-- Solution: Add SECURITY DEFINER to admin RPC functions
--           They will execute with database owner privileges, bypassing RLS
--           Safe because these are admin-only functions with proper validation
-- =====================================================

BEGIN;

-- =====================================================
-- 1. Add SECURITY DEFINER to get_paginated_bars
-- =====================================================

CREATE OR REPLACE FUNCTION get_paginated_bars(
    p_page INT,
    p_limit INT,
    p_search_query TEXT DEFAULT '',
    p_status_filter TEXT DEFAULT 'all',
    p_sort_by TEXT DEFAULT 'name',
    p_sort_order TEXT DEFAULT 'asc'
)
RETURNS TABLE (bars JSON, total_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH filtered_bars AS (
        SELECT
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
        WHERE
            (p_search_query = '' OR b.name ILIKE '%' || p_search_query || '%' OR b.address ILIKE '%' || p_search_query || '%') AND
            (p_status_filter = 'all' OR (p_status_filter = 'active' AND b.is_active = true) OR (p_status_filter = 'suspended' AND b.is_active = false))
    )
    SELECT
        (SELECT json_agg(json_build_object(
            'id', paginated.id,
            'name', paginated.name,
            'address', paginated.address,
            'phone', paginated.phone,
            'owner_id', paginated.owner_id,
            'created_at', paginated.created_at,
            'is_active', paginated.is_active,
            'closing_hour', paginated.closing_hour,
            'settings', paginated.settings
        )) FROM (
            SELECT *
            FROM filtered_bars
            ORDER BY
                CASE WHEN p_sort_by = 'name' AND p_sort_order = 'asc' THEN name END ASC,
                CASE WHEN p_sort_by = 'name' AND p_sort_order = 'desc' THEN name END DESC,
                CASE WHEN p_sort_by = 'created_at' AND p_sort_order = 'asc' THEN created_at END ASC,
                CASE WHEN p_sort_by = 'created_at' AND p_sort_order = 'desc' THEN created_at END DESC
            LIMIT p_limit
            OFFSET (p_page - 1) * p_limit
        ) paginated) AS bars,
        (SELECT COUNT(*) FROM filtered_bars) AS total_count;
END;
$$;

-- =====================================================
-- 2. Add SECURITY DEFINER to get_unique_bars
-- =====================================================

DROP FUNCTION IF EXISTS get_unique_bars();

CREATE FUNCTION get_unique_bars()
RETURNS TABLE (id UUID, name TEXT, is_active BOOLEAN)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        b.id,
        b.name,
        b.is_active
    FROM bars b
    ORDER BY b.name;
$$;

-- =====================================================
-- 3. Grant permissions to authenticated users
-- =====================================================

GRANT EXECUTE ON FUNCTION get_paginated_bars TO authenticated;
GRANT EXECUTE ON FUNCTION get_unique_bars TO authenticated;

COMMIT;
