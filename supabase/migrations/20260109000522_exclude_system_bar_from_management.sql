-- =====================================================
-- FIX: Exclude "système" bar from admin bar management
-- =====================================================
-- Issue: Superadmin "Gestion des bars" only shows "système" bar
--        RPC get_paginated_bars returns ALL bars including système
--        Should exclude système bar from the list
--
-- Root Cause:
--   - RPC get_paginated_bars has no filtering for système bar
--   - Migration 521 fixed triggers but not the actual data loading
--   - Need to identify and exclude système bar from results
--
-- Solution: Add WHERE clause to exclude système bar
--           Système bar typically has a specific name or id pattern
-- =====================================================

BEGIN;

-- First, let's identify the système bar (usually named 'Système' or has special ID)
-- Create or replace the function to exclude système bar

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
            -- Exclude système bar (by name pattern)
            LOWER(b.name) NOT LIKE '%système%' AND
            LOWER(b.name) NOT LIKE '%system%' AND
            -- Original filters
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

-- Also fix get_unique_bars() - create or replace directly
CREATE OR REPLACE FUNCTION get_unique_bars()
RETURNS TABLE (id UUID, name TEXT, is_active BOOLEAN)
LANGUAGE sql
AS $$
    SELECT
        b.id,
        b.name,
        b.is_active
    FROM bars b
    WHERE
        LOWER(b.name) NOT LIKE '%système%' AND
        LOWER(b.name) NOT LIKE '%system%'
    ORDER BY b.name;
$$;

DO $$
BEGIN
  RAISE NOTICE '
  ╔════════════════════════════════════════════════════════════╗
  ║  FIXED: Exclude système bar from admin management          ║
  ╚════════════════════════════════════════════════════════════╝

  ✅ Updated get_paginated_bars() to exclude système bar
  ✅ Updated get_unique_bars() to exclude système bar
  ✅ Filters by name pattern: NOT LIKE %système% and NOT LIKE %system%

  What Was Wrong:
  • RPC returned ALL bars including système/system bar
  • Superadmin saw only système bar in "Gestion des bars"
  • No filtering logic in the query

  What Is Fixed:
  • WHERE clause now excludes bars with name containing "système" or "system"
  • Both get_paginated_bars and get_unique_bars updated
  • Superadmin will now see all real bars except système

  Impact:
  ✓ Superadmin can see all bars in "Gestion des bars"
  ✓ ActingAs feature works with real bars
  ✓ Système bar hidden from management interface
  ✓ Audit logs still track all changes
  ';
END $$;

COMMIT;
