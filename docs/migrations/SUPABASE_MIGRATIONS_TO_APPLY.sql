-- ========================================================================
-- COPY EVERYTHING BELOW AND PASTE INTO SUPABASE SQL EDITOR
-- ========================================================================

-- FIX 1: get_paginated_users - Replace roles::jsonb @> with roles::text LIKE
DROP FUNCTION IF EXISTS get_paginated_users(INT, INT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION get_paginated_users(
    p_page INT,
    p_limit INT,
    p_search_query TEXT DEFAULT '',
    p_role_filter TEXT DEFAULT 'all'
)
RETURNS TABLE (users JSON, total_count BIGINT)
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
            COALESCE(json_agg(DISTINCT bm.role) FILTER (WHERE bm.role IS NOT NULL AND bm.is_active = true), '[]'::json) AS roles,
            COALESCE(json_agg(DISTINCT json_build_object('id', b.id, 'name', b.name)) FILTER (WHERE b.id IS NOT NULL AND bm.is_active = true), '[]'::json) AS bars
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
        (SELECT json_agg(json_build_object(
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
        )) FROM (
            SELECT *
            FROM filtered_users
            ORDER BY created_at DESC
            LIMIT p_limit
            OFFSET (p_page - 1) * p_limit
        ) paginated) AS users,
        (SELECT COUNT(*) FROM filtered_users) AS total_count;
END;
$$ LANGUAGE plpgsql;

-- ========================================================================

-- FIX 2: get_dashboard_stats - Add business date logic with closing hour
DROP FUNCTION IF EXISTS get_dashboard_stats(TEXT);

CREATE OR REPLACE FUNCTION get_dashboard_stats(p_period TEXT DEFAULT '1 day')
RETURNS TABLE (
  total_revenue NUMERIC,
  sales_count BIGINT,
  active_users_count BIGINT,
  new_users_count BIGINT,
  bars_count BIGINT,
  active_bars_count BIGINT
) AS $$
DECLARE
  v_closing_hour INT := 6;
  v_period_days INT;
  v_start_date DATE;
BEGIN
  v_period_days := CAST(SPLIT_PART(p_period, ' ', 1) AS INT);

  IF EXTRACT(HOUR FROM CURRENT_TIME) < v_closing_hour THEN
    v_start_date := CURRENT_DATE - (v_period_days || ' days')::INTERVAL;
  ELSE
    v_start_date := CURRENT_DATE - ((v_period_days - 1) || ' days')::INTERVAL;
  END IF;

  RETURN QUERY
  SELECT
    (SELECT COALESCE(SUM(total), 0) FROM sales
      WHERE status = 'validated'
      AND DATE(created_at - (v_closing_hour || ' hours')::INTERVAL) >= v_start_date)::NUMERIC,

    (SELECT COUNT(*) FROM sales
      WHERE status = 'validated'
      AND DATE(created_at - (v_closing_hour || ' hours')::INTERVAL) >= v_start_date)::BIGINT,

    (SELECT COUNT(DISTINCT id) FROM users
      WHERE is_active = true
      AND last_login_at IS NOT NULL
      AND DATE(last_login_at - (v_closing_hour || ' hours')::INTERVAL) >= v_start_date)::BIGINT,

    (SELECT COUNT(*) FROM users
      WHERE is_active = true
      AND DATE(created_at - (v_closing_hour || ' hours')::INTERVAL) >= v_start_date)::BIGINT,

    (SELECT COUNT(*) FROM bars WHERE is_active = true)::BIGINT,

    (SELECT COUNT(DISTINCT bar_id) FROM bar_members WHERE is_active = true)::BIGINT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_dashboard_stats(TEXT) TO authenticated;

-- ========================================================================
-- VERIFICATION: Run this after applying fixes above
-- ========================================================================

SELECT 'get_paginated_users' as function_name,
       pg_get_functiondef(oid) LIKE '%roles::text LIKE%' as has_text_like_fix
FROM pg_proc
WHERE proname = 'get_paginated_users' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
LIMIT 1;

SELECT 'get_dashboard_stats' as function_name,
       pg_get_functiondef(oid) LIKE '%v_closing_hour INT := 6%' as has_business_date_fix
FROM pg_proc
WHERE proname = 'get_dashboard_stats' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
LIMIT 1;
