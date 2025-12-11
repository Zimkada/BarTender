-- supabase/migrations/20251211174059_create_admin_rpc.sql

-- Fonction pour récupérer les statistiques du dashboard
CREATE OR REPLACE FUNCTION get_dashboard_stats(
    period TEXT DEFAULT 'today'
)
RETURNS TABLE(
    total_revenue NUMERIC,
    sales_count BIGINT,
    active_users_count BIGINT,
    new_users_count BIGINT,
    bars_count BIGINT,
    active_bars_count BIGINT
)
AS $$
DECLARE
    start_date DATE;
    end_date DATE;
BEGIN
    -- Déterminer la plage de dates en fonction de la période
    IF period = 'today' THEN
        start_date := CURRENT_DATE;
        end_date := CURRENT_DATE;
    ELSIF period = '7d' THEN
        start_date := CURRENT_DATE - INTERVAL '6 days';
        end_date := CURRENT_DATE;
    ELSIF period = '30d' THEN
        start_date := CURRENT_DATE - INTERVAL '29 days';
        end_date := CURRENT_DATE;
    ELSE
        start_date := CURRENT_DATE;
        end_date := CURRENT_DATE;
    END IF;

    RETURN QUERY
    SELECT
        -- 1. Chiffre d'affaires total
        (SELECT COALESCE(SUM(s.total), 0) - COALESCE(SUM(r.refund_amount), 0)
         FROM sales s
         LEFT JOIN returns r ON s.id = r.sale_id AND r.is_refunded = TRUE
         WHERE s.status = 'validated'
           AND s.business_date BETWEEN start_date AND end_date) AS total_revenue,

        -- 2. Nombre total de ventes
        (SELECT COUNT(*) FROM sales WHERE status = 'validated' AND business_date BETWEEN start_date AND end_date) AS sales_count,

        -- 3. Nombre d'utilisateurs actifs (dernière connexion dans les 7 derniers jours)
        (SELECT COUNT(*) FROM users WHERE last_login_at >= (NOW() - INTERVAL '7 days')) AS active_users_count,
        
        -- 4. Nouveaux utilisateurs
        (SELECT COUNT(*) FROM users WHERE created_at BETWEEN start_date AND end_date) AS new_users_count,

        -- 5. Nombre total de bars
        (SELECT COUNT(*) FROM bars) AS bars_count,

        -- 6. Nombre de bars actifs
        (SELECT COUNT(*) FROM bars WHERE is_active = TRUE) AS active_bars_count;
END;
$$ LANGUAGE plpgsql;

-- Fonction pour récupérer les utilisateurs de manière paginée, avec recherche et filtre par rôle
CREATE OR REPLACE FUNCTION get_paginated_users(
    p_page INT,
    p_limit INT,
    p_search_query TEXT DEFAULT '',
    p_role_filter TEXT DEFAULT 'all' -- 'all', 'promoteur', 'gerant', 'serveur'
)
RETURNS TABLE (
    users JSON,
    total_count BIGINT
)
AS $$
BEGIN
    RETURN QUERY
    WITH filtered_users AS (
        SELECT u.*, array_agg(bm.role) as roles
        FROM users u
        LEFT JOIN bar_members bm ON u.id = bm.user_id
        WHERE
            -- Filtre de recherche
            (p_search_query = '' OR
             u.name ILIKE '%' || p_search_query || '%' OR
             u.email ILIKE '%' || p_search_query || '%' OR
             u.phone ILIKE '%' || p_search_query || '%')
        GROUP BY u.id
    ),
    role_filtered_users AS (
        SELECT *
        FROM filtered_users
        WHERE
            -- Filtre de rôle
            (p_role_filter = 'all' OR p_role_filter = ANY(roles))
    )
    SELECT
        (SELECT json_agg(rfu.*) FROM (
            SELECT * FROM role_filtered_users
            ORDER BY created_at DESC
            LIMIT p_limit
            OFFSET (p_page - 1) * p_limit
        ) rfu) AS users,
        (SELECT COUNT(*) FROM role_filtered_users) AS total_count;
END;
$$ LANGUAGE plpgsql;


-- Fonction pour récupérer les bars de manière paginée, avec recherche et tri
CREATE OR REPLACE FUNCTION get_paginated_bars(
    p_page INT,
    p_limit INT,
    p_search_query TEXT DEFAULT '',
    p_status_filter TEXT DEFAULT 'all',
    p_sort_by TEXT DEFAULT 'name',
    p_sort_order TEXT DEFAULT 'asc'
)
RETURNS TABLE (
    bars JSON,
    total_count BIGINT
)
AS $$
BEGIN
    RETURN QUERY
    WITH filtered_bars AS (
        SELECT *
        FROM bars
        WHERE
            -- Filtre de statut
            (p_status_filter = 'all' OR
             (p_status_filter = 'active' AND is_active = TRUE) OR
             (p_status_filter = 'suspended' AND is_active = FALSE))
            AND
            -- Filtre de recherche
            (p_search_query = '' OR
             name ILIKE '%' || p_search_query || '%' OR
             address ILIKE '%' || p_search_query || '%' OR
             email ILIKE '%' || p_search_query || '%')
    )
    SELECT
        (SELECT json_agg(fb.*) FROM (
            SELECT * FROM filtered_bars
            ORDER BY
                CASE WHEN p_sort_by = 'name' AND p_sort_order = 'asc' THEN name END ASC,
                CASE WHEN p_sort_by = 'name' AND p_sort_order = 'desc' THEN name END DESC,
                CASE WHEN p_sort_by = 'created_at' AND p_sort_order = 'asc' THEN created_at END ASC,
                CASE WHEN p_sort_by = 'created_at' AND p_sort_order = 'desc' THEN created_at END DESC
            LIMIT p_limit
            OFFSET (p_page - 1) * p_limit
        ) fb) AS bars,
        (SELECT COUNT(*) FROM filtered_bars) AS total_count;
END;
$$ LANGUAGE plpgsql;