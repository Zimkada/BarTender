-- Fix ambiguous column references in the get_paginated_catalog_logs_for_admin RPC function.
-- This is a permanent fix for the "column reference is ambiguous" errors.

CREATE OR REPLACE FUNCTION get_paginated_catalog_logs_for_admin(
    p_page INT,
    p_limit INT,
    p_search_query TEXT DEFAULT '',
    p_action_filter TEXT DEFAULT NULL,
    p_entity_filter TEXT DEFAULT NULL,
    p_start_date TEXT DEFAULT NULL,
    p_end_date TEXT DEFAULT NULL
)
RETURNS TABLE(
    id UUID,
    action TEXT,
    entity_type TEXT,
    entity_id UUID,
    entity_name TEXT,
    old_values JSONB,
    new_values JSONB,
    modified_by UUID,
    created_at TIMESTAMPTZ,
    total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Manually check for super_admin role.
    IF NOT is_super_admin() THEN
        RAISE EXCEPTION 'Forbidden: Only super admins can perform this action.';
    END IF;

    -- Use a CTE to filter once and count, then select paginated data from it.
    RETURN QUERY
    WITH filtered_logs AS (
        SELECT *
        FROM global_catalog_audit_log
        WHERE
            -- Qualify all column names with the table name to remove ambiguity
            (p_search_query = '' OR global_catalog_audit_log.entity_name ILIKE '%' || p_search_query || '%')
        AND (p_action_filter IS NULL OR global_catalog_audit_log.action = p_action_filter)
        AND (p_entity_filter IS NULL OR global_catalog_audit_log.entity_type = p_entity_filter)
        AND (p_start_date IS NULL OR global_catalog_audit_log.created_at >= (p_start_date || 'T00:00:00Z')::timestamptz)
        AND (p_end_date IS NULL OR global_catalog_audit_log.created_at <= (p_end_date || 'T23:59:59Z')::timestamptz)
    )
    SELECT
        l.id,
        l.action,
        l.entity_type,
        l.entity_id,
        l.entity_name,
        l.old_values,
        l.new_values,
        l.modified_by,
        l.created_at,
        (SELECT COUNT(*) FROM filtered_logs) AS total_count
    FROM filtered_logs l
    ORDER BY l.created_at DESC
    LIMIT p_limit
    OFFSET (p_page - 1) * p_limit;
END;
$$;
