-- supabase/migrations/20251211174059_create_admin_rpc.sql

-- Fonction pour récupérer les statistiques du dashboard
CREATE OR REPLACE FUNCTION get_dashboard_stats(period TEXT DEFAULT 'today')
RETURNS TABLE(total_revenue NUMERIC, sales_count BIGINT, active_users_count BIGINT, new_users_count BIGINT, bars_count BIGINT, active_bars_count BIGINT)
AS $$
    -- ... (contenu de la fonction)
$$ LANGUAGE plpgsql;

-- Fonction pour récupérer les bars de manière paginée
CREATE OR REPLACE FUNCTION get_paginated_bars(p_page INT, p_limit INT, p_search_query TEXT DEFAULT '', p_status_filter TEXT DEFAULT 'all', p_sort_by TEXT DEFAULT 'name', p_sort_order TEXT DEFAULT 'asc')
RETURNS TABLE (bars JSON, total_count BIGINT)
AS $$
    -- ... (contenu de la fonction)
$$ LANGUAGE plpgsql;

-- Fonction pour récupérer les utilisateurs de manière paginée
CREATE OR REPLACE FUNCTION get_paginated_users(p_page INT, p_limit INT, p_search_query TEXT DEFAULT '', p_role_filter TEXT DEFAULT 'all')
RETURNS TABLE (users JSON, total_count BIGINT)
AS $$
    -- ... (contenu de la fonction)
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
