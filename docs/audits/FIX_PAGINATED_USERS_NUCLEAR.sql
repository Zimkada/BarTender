-- ========================================================================
-- NUCLEAR OPTION: Force complete replacement of get_paginated_users
-- ========================================================================
-- This executes in a single transaction to ensure clean replacement

BEGIN TRANSACTION;

-- 1. First, drop ALL versions of the function (including overloads)
DROP FUNCTION IF EXISTS get_paginated_users() CASCADE;
DROP FUNCTION IF EXISTS get_paginated_users(INT) CASCADE;
DROP FUNCTION IF EXISTS get_paginated_users(INT, INT) CASCADE;
DROP FUNCTION IF EXISTS get_paginated_users(INT, INT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS get_paginated_users(INT, INT, TEXT, TEXT) CASCADE;

-- 2. Wait a moment (implicit in transaction)

-- 3. Create the ONLY correct version
CREATE FUNCTION get_paginated_users(
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

-- 4. Grant permissions
GRANT EXECUTE ON FUNCTION get_paginated_users(INT, INT, TEXT, TEXT) TO authenticated;

-- 5. Commit the transaction
COMMIT;

-- ========================================================================
-- VERIFICATION (run separately after commit)
-- ========================================================================
SELECT
    'SUCCESS' as status,
    proname,
    pg_get_functiondef(oid) LIKE '%bar_members%' as uses_bar_members,
    pg_get_functiondef(oid) LIKE '%user_roles%' as uses_broken_user_roles_table
FROM pg_proc
WHERE proname = 'get_paginated_users'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
