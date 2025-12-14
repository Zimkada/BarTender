-- ========================================================================
-- FINAL FIX: Recreate get_paginated_users with JSONB for performance and stability
-- ========================================================================
-- Problem: The function used JSON type and text-based LIKE for filtering,
--          which is inefficient and can cause PostgREST introspection issues.
-- Solution: Use JSONB for roles and the `?` operator for filtering.
-- ========================================================================

-- Drop the existing function
DROP FUNCTION IF EXISTS get_paginated_users(INT, INT, TEXT, TEXT) CASCADE;

-- Create the corrected function using JSONB
CREATE OR REPLACE FUNCTION get_paginated_users(
    p_page INT,
    p_limit INT,
    p_search_query TEXT DEFAULT '',
    p_role_filter TEXT DEFAULT 'all'
)
RETURNS TABLE (users JSONB, total_count BIGINT)
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
                jsonb_agg(DISTINCT bm.role) FILTER (WHERE bm.role IS NOT NULL AND bm.is_active = true),
                '[]'::jsonb
            ) AS roles,
            COALESCE(
                jsonb_agg(DISTINCT jsonb_build_object('id', b.id, 'name', b.name))
                FILTER (WHERE b.id IS NOT NULL AND bm.is_active = true),
                '[]'::jsonb
            ) AS bars
        FROM users u
        LEFT JOIN bar_members bm ON bm.user_id = u.id
        LEFT JOIN bars b ON bm.bar_id = b.id
        WHERE
            (p_search_query = '' OR
             u.username ILIKE '%' || p_search_query || '%' OR
             u.name ILIKE '%' || p_search_query || '%' OR
             u.email ILIKE '%' || p_search_query || '%')
        GROUP BY u.id
    ),
    filtered_users AS (
        SELECT *
        FROM user_roles_and_bars
        WHERE
            (p_role_filter = 'all' OR roles ? p_role_filter)
    )
    SELECT
        (
            SELECT jsonb_agg(f)
            FROM (
                SELECT *
                FROM filtered_users
                ORDER BY created_at DESC
                LIMIT p_limit
                OFFSET (p_page - 1) * p_limit
            ) f
        ) AS users,
        (SELECT COUNT(*) FROM filtered_users) AS total_count;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_paginated_users(INT, INT, TEXT, TEXT) TO authenticated;

-- Add a comment to explain the function
COMMENT ON FUNCTION get_paginated_users(INT, INT, TEXT, TEXT) IS
'Get a paginated list of users with their roles and bar associations.
Uses JSONB for roles and the `?` operator for efficient filtering.
Supports search by username/name/email and filtering by role.';
