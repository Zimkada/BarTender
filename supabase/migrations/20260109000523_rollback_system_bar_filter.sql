-- =====================================================
-- ROLLBACK: Remove système bar filter from get_paginated_bars
-- =====================================================
-- Issue: Migration 522 added filter to exclude système bar
--        But now NO bars appear in admin panel (including real bars)
--        The filter was the wrong approach
--
-- Root Cause Analysis:
--   Migration 522 was based on wrong assumption that système bar
--   was in the regular bars table. The real issue is likely:
--   1. RLS policies blocking superadmin access
--   2. Helper functions not working with SECURITY DEFINER context
--   3. Bar_members table not having superadmin entry
--
-- Solution: Restore original get_paginated_bars WITHOUT système filter
--           Investigate the REAL root cause separately
-- =====================================================

BEGIN;

-- Restore original get_paginated_bars (no système filter)
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
            -- Original filters ONLY (no système exclusion)
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

-- Restore get_unique_bars (no système filter)
-- Note: Will be updated to SECURITY DEFINER in migration 524
DROP FUNCTION IF EXISTS get_unique_bars();

CREATE FUNCTION get_unique_bars()
RETURNS TABLE (id UUID, name TEXT, is_active BOOLEAN)
LANGUAGE sql
AS $$
    SELECT
        b.id,
        b.name,
        b.is_active
    FROM bars b
    ORDER BY b.name;
$$;

-- Note: This rollback restores original functions.
-- Migration 524 will add SECURITY DEFINER to fix the real RLS issue.

COMMIT;
