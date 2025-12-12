-- supabase/migrations/20251211174059_create_admin_rpc.sql

-- Fonction pour récupérer les statistiques du dashboard
CREATE OR REPLACE FUNCTION get_dashboard_stats(period TEXT DEFAULT 'today')
RETURNS TABLE(total_revenue NUMERIC, sales_count BIGINT, active_users_count BIGINT, new_users_count BIGINT, bars_count BIGINT, active_bars_count BIGINT)
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(SUM(s.total), 0)::NUMERIC AS total_revenue,
        COUNT(DISTINCT s.id)::BIGINT AS sales_count,
        COUNT(DISTINCT u.id)::BIGINT AS active_users_count,
        COUNT(DISTINCT CASE WHEN u.created_at >= (NOW() - INTERVAL '1 day') THEN u.id END)::BIGINT AS new_users_count,
        COUNT(DISTINCT b.id)::BIGINT AS bars_count,
        COUNT(DISTINCT CASE WHEN b.is_active = true THEN b.id END)::BIGINT AS active_bars_count
    FROM bars b
    LEFT JOIN sales s ON s.bar_id = b.id
    LEFT JOIN users u ON u.id IN (SELECT user_id FROM bar_members WHERE bar_id = b.id)
    WHERE
        (period = 'today' AND DATE(s.created_at) = CURRENT_DATE) OR
        (period = '7d' AND s.created_at >= NOW() - INTERVAL '7 days') OR
        (period = '30d' AND s.created_at >= NOW() - INTERVAL '30 days') OR
        s.created_at IS NULL;
END;
$$ LANGUAGE plpgsql;

-- Fonction pour récupérer les bars de manière paginée
CREATE OR REPLACE FUNCTION get_paginated_bars(p_page INT, p_limit INT, p_search_query TEXT DEFAULT '', p_status_filter TEXT DEFAULT 'all', p_sort_by TEXT DEFAULT 'name', p_sort_order TEXT DEFAULT 'asc')
RETURNS TABLE (bars JSON, total_count BIGINT)
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
$$ LANGUAGE plpgsql;

-- Fonction pour récupérer les utilisateurs de manière paginée
CREATE OR REPLACE FUNCTION get_paginated_users(p_page INT, p_limit INT, p_search_query TEXT DEFAULT '', p_role_filter TEXT DEFAULT 'all')
RETURNS TABLE (users JSON, total_count BIGINT)
AS $$
BEGIN
    RETURN QUERY
    WITH user_roles AS (
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
            COALESCE(json_agg(DISTINCT r.role) FILTER (WHERE r.role IS NOT NULL), '[]'::json) AS roles
        FROM users u
        LEFT JOIN user_roles r ON r.user_id = u.id
        WHERE
            (p_search_query = '' OR u.username ILIKE '%' || p_search_query || '%' OR u.name ILIKE '%' || p_search_query || '%' OR u.email ILIKE '%' || p_search_query || '%')
        GROUP BY u.id, u.username, u.name, u.phone, u.email, u.created_at, u.is_active, u.first_login, u.last_login_at
    ),
    filtered_users AS (
        SELECT *
        FROM user_roles ur
        WHERE
            (p_role_filter = 'all' OR (p_role_filter != 'all' AND ur.roles::text LIKE '%' || p_role_filter || '%'))
    )
    SELECT
        (SELECT json_agg(json_build_object(
            'id', paginated_users.id,
            'username', paginated_users.username,
            'name', paginated_users.name,
            'phone', paginated_users.phone,
            'email', paginated_users.email,
            'created_at', paginated_users.created_at,
            'is_active', paginated_users.is_active,
            'first_login', paginated_users.first_login,
            'last_login_at', paginated_users.last_login_at,
            'roles', paginated_users.roles
        )) FROM (
            SELECT *
            FROM filtered_users
            ORDER BY created_at DESC
            LIMIT p_limit
            OFFSET (p_page - 1) * p_limit
        ) paginated_users) AS users,
        (SELECT COUNT(*) FROM filtered_users) AS total_count;
END;
$$ LANGUAGE plpgsql;

-- Fonction pour récupérer les logs d'audit de manière paginée et filtrée
CREATE OR REPLACE FUNCTION get_paginated_audit_logs(
    p_page INT,
    p_limit INT,
    p_search_query TEXT DEFAULT '',
    p_severity_filter TEXT DEFAULT 'all',
    p_event_filter TEXT DEFAULT 'all',
    p_bar_filter TEXT DEFAULT 'all',
    p_start_date TEXT DEFAULT NULL,
    p_end_date TEXT DEFAULT NULL
)
RETURNS TABLE (
    logs JSON,
    total_count BIGINT
)
AS $$
BEGIN
    RETURN QUERY
    WITH filtered_logs AS (
        SELECT *
        FROM audit_logs
        WHERE
            (p_search_query = '' OR description ILIKE '%' || p_search_query || '%' OR user_name ILIKE '%' || p_search_query || '%' OR bar_name ILIKE '%' || p_search_query || '%') AND
            (p_severity_filter = 'all' OR severity::text = p_severity_filter) AND
            (p_event_filter = 'all' OR event::text = p_event_filter) AND
            (p_bar_filter = 'all' OR (p_bar_filter = 'system' AND bar_id IS NULL) OR bar_id::text = p_bar_filter) AND
            (p_start_date IS NULL OR timestamp >= p_start_date::timestamp) AND
            (p_end_date IS NULL OR timestamp <= (p_end_date::timestamp + interval '1 day'))
    )
    SELECT
        (SELECT json_agg(fl.*) FROM (
            SELECT * FROM filtered_logs
            ORDER BY timestamp DESC
            LIMIT p_limit
            OFFSET (p_page - 1) * p_limit
        ) fl) AS logs,
        (SELECT COUNT(*) FROM filtered_logs) AS total_count;
END;
$$ LANGUAGE plpgsql;
