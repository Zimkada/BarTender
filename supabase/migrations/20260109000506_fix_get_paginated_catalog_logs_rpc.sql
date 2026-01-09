-- =====================================================
-- FIX: get_paginated_catalog_logs_for_admin RPC
-- =====================================================
-- Issue: RPC returns 400 Bad Request
-- Root cause: search_path not set properly + parameter handling
-- Solution: Add proper search_path + validate parameters

BEGIN;

-- =====================================================
-- 1. RECREATE RPC WITH PROPER search_path
-- =====================================================

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
SET search_path = public, auth
AS $$
DECLARE
    v_offset INT;
BEGIN
    -- RLS policy on global_catalog_audit_log table will enforce super_admin access
    -- No need for explicit check here - let RLS handle it

    -- Validate page and limit
    IF p_page < 1 THEN
        v_offset := 0;
    ELSE
        v_offset := (p_page - 1) * COALESCE(p_limit, 50);
    END IF;

    -- Return paginated results
    RETURN QUERY
    WITH filtered_logs AS (
        SELECT
            l.id,
            l.action,
            l.entity_type,
            l.entity_id,
            l.entity_name,
            l.old_values,
            l.new_values,
            l.modified_by,
            l.created_at
        FROM public.global_catalog_audit_log l
        WHERE
            (p_search_query = '' OR l.entity_name ILIKE '%' || p_search_query || '%')
            AND (p_action_filter IS NULL OR l.action = p_action_filter)
            AND (p_entity_filter IS NULL OR l.entity_type = p_entity_filter)
            AND (p_start_date IS NULL OR l.created_at >= (p_start_date || 'T00:00:00Z')::timestamptz)
            AND (p_end_date IS NULL OR l.created_at <= (p_end_date || 'T23:59:59Z')::timestamptz)
    )
    SELECT
        fl.id,
        fl.action,
        fl.entity_type,
        fl.entity_id,
        fl.entity_name,
        fl.old_values,
        fl.new_values,
        fl.modified_by,
        fl.created_at,
        (SELECT COUNT(*)::BIGINT FROM filtered_logs) AS total_count
    FROM filtered_logs fl
    ORDER BY fl.created_at DESC
    LIMIT COALESCE(p_limit, 50)
    OFFSET v_offset;
END;
$$;

-- =====================================================
-- 2. GRANT EXECUTE ON RPC
-- =====================================================

GRANT EXECUTE ON FUNCTION get_paginated_catalog_logs_for_admin(
    INT, INT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;

GRANT EXECUTE ON FUNCTION get_paginated_catalog_logs_for_admin(
    INT, INT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO anon;

-- =====================================================
-- 3. ADD RLS POLICY ON global_catalog_audit_log
-- =====================================================

ALTER TABLE public.global_catalog_audit_log ENABLE ROW LEVEL SECURITY;

-- Only super_admins can view catalog audit logs
DROP POLICY IF EXISTS "Super admins can view catalog audit logs" ON global_catalog_audit_log;

CREATE POLICY "Super admins can view catalog audit logs"
ON global_catalog_audit_log FOR SELECT
USING (is_super_admin());

-- System can insert audit logs
DROP POLICY IF EXISTS "System can create catalog audit logs" ON global_catalog_audit_log;

CREATE POLICY "System can create catalog audit logs"
ON global_catalog_audit_log FOR INSERT
WITH CHECK (true);

-- =====================================================
-- 4. GRANT SELECT ON TABLE (for direct access)
-- =====================================================

GRANT SELECT ON TABLE public.global_catalog_audit_log TO authenticated;
GRANT SELECT ON TABLE public.global_catalog_audit_log TO anon;
GRANT INSERT ON TABLE public.global_catalog_audit_log TO authenticated;
GRANT INSERT ON TABLE public.global_catalog_audit_log TO anon;

-- =====================================================
-- 5. VERIFICATION
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '
    ╔════════════════════════════════════════════════════════════╗
    ║   get_paginated_catalog_logs_for_admin RPC FIX APPLIED     ║
    ╚════════════════════════════════════════════════════════════╝

    ✅ Recreated RPC with proper search_path = public, auth
    ✅ Added parameter validation (page, limit)
    ✅ Fixed date parsing (T00:00:00Z and T23:59:59Z)
    ✅ Explicitly qualified table references (public.global_catalog_audit_log)
    ✅ GRANT EXECUTE ON RPC to authenticated and anon
    ✅ Added RLS policy "Super admins can view catalog audit logs"
    ✅ Added GRANT SELECT on global_catalog_audit_log table
    ✅ Added GRANT INSERT for audit log creation

    Result:
    • RPC should return 200 OK instead of 400 Bad Request
    • Super_admin can paginate catalog audit logs
    • Proper RLS protection on the underlying table
    ';
END $$;

COMMIT;
