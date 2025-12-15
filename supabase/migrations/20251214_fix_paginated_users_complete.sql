-- ========================================================================
-- COMPLETE FIX: Recreate get_paginated_users with correct data sources
-- ========================================================================
-- Problem: Original function referenced non-existent user_roles table
-- Solution: Use bar_members table (where roles actually are stored)
-- ========================================================================

-- Drop the broken function completely
DROP FUNCTION IF EXISTS get_paginated_users(INT, INT, TEXT, TEXT) CASCADE;

-- Create the corrected function
CREATE OR REPLACE FUNCTION get_paginated_users(
    p_page INT,
    p_limit INT,
    p_search_query TEXT DEFAULT '',
    p_role_filter TEXT DEFAULT 'all'
)
RETURNS TABLE (users JSON, total_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH user_roles_and_bars AS (
        SELECT
            u.id,
            u.username,
            u.name,
            u.phone,
            u.email,
            u.created_at,
            u.is_active,
            u.first_login,
            u.last_login_at,
            COALESCE(
                json_agg(DISTINCT bm.role) FILTER (WHERE bm.role IS NOT NULL AND bm.is_active = true),
                '[]'::json
            ) AS roles,
            COALESCE(
                json_agg(DISTINCT json_build_object('id', b.id, 'name', b.name))
                FILTER (WHERE b.id IS NOT NULL AND bm.is_active = true),
                '[]'::json
            ) AS bars
        FROM users u
        LEFT JOIN bar_members bm ON bm.user_id = u.id
        LEFT JOIN bars b ON bm.bar_id = b.id
        WHERE
            (p_search_query = '' OR
             u.username ILIKE '%' || p_search_query || '%' OR
             u.name ILIKE '%' || p_search_query || '%' OR
             u.email ILIKE '%' || p_search_query || '%')
        GROUP BY u.id, u.username, u.name, u.phone, u.email, u.created_at, u.is_active, u.first_login, u.last_login_at
    ),
    filtered_users AS (
        SELECT *
        FROM user_roles_and_bars
        WHERE
            (p_role_filter = 'all' OR roles::text LIKE '%' || p_role_filter || '%')
    )
    SELECT
        (
            SELECT json_agg(json_build_object(
                'id', paginated.id,
                'username', paginated.username,
                'name', paginated.name,
                'phone', paginated.phone,
                'email', paginated.email,
                'created_at', paginated.created_at,
                'is_active', paginated.is_active,
                'first_login', paginated.first_login,
                'last_login_at', paginated.last_login_at,
                'roles', paginated.roles,
                'bars', paginated.bars
            ))
            FROM (
                SELECT *
                FROM filtered_users
                ORDER BY created_at DESC
                LIMIT p_limit
                OFFSET (p_page - 1) * p_limit
            ) paginated
        ) AS users,
        (SELECT COUNT(*) FROM filtered_users) AS total_count;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_paginated_users(INT, INT, TEXT, TEXT) TO authenticated;

-- Add helpful comment
COMMENT ON FUNCTION get_paginated_users(INT, INT, TEXT, TEXT) IS
'Get paginated list of users with their roles and bar associations.
Uses bar_members table (not non-existent user_roles table).
Supports search by username/name/email and filtering by role.';

-- ========================================================================
-- VERIFICATION QUERY
-- ========================================================================
-- Run this to verify the function was created correctly:
SELECT
    proname as function_name,
    prosrc LIKE '%bar_members%' as uses_bar_members_correct,
    prosrc LIKE '%user_roles%' as still_references_broken_table
FROM pg_proc
WHERE proname = 'get_paginated_users' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
LIMIT 1;
