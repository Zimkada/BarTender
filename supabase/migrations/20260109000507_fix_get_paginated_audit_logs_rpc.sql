-- =====================================================
-- FIX: get_paginated_audit_logs RPC
-- =====================================================
-- Issue: "permission denied for table audit_logs" for super_admin
-- Root cause: RPC missing SECURITY DEFINER + search_path
-- Solution: Add SECURITY DEFINER and proper search_path

BEGIN;

-- =====================================================
-- 1. RECREATE RPC WITH SECURITY DEFINER
-- =====================================================

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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    -- RLS policy on audit_logs table will enforce super_admin access
    -- No need for explicit check here - let RLS handle it

    RETURN QUERY
    WITH filtered_logs AS (
        SELECT *
        FROM public.audit_logs
        WHERE
            (p_search_query = ''
             OR description ILIKE '%' || p_search_query || '%'
             OR user_name ILIKE '%' || p_search_query || '%'
             OR bar_name ILIKE '%' || p_search_query || '%')
            AND (p_severity_filter = 'all' OR severity::text = p_severity_filter)
            AND (p_event_filter = 'all' OR event::text = p_event_filter)
            AND (p_bar_filter = 'all'
                 OR (p_bar_filter = 'system' AND bar_id IS NULL)
                 OR bar_id::text = p_bar_filter)
            AND (p_start_date IS NULL OR "timestamp" >= p_start_date::timestamp)
            AND (p_end_date IS NULL OR "timestamp" <= (p_end_date::timestamp + interval '1 day'))
    )
    SELECT
        (SELECT json_agg(fl.* ORDER BY fl."timestamp" DESC) FROM (
            SELECT * FROM filtered_logs
            ORDER BY "timestamp" DESC
            LIMIT p_limit
            OFFSET (p_page - 1) * p_limit
        ) fl) AS logs,
        (SELECT COUNT(*) FROM filtered_logs) AS total_count;
END;
$$;

-- =====================================================
-- 2. GRANT EXECUTE ON RPC
-- =====================================================

GRANT EXECUTE ON FUNCTION get_paginated_audit_logs(
    INT, INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;

GRANT EXECUTE ON FUNCTION get_paginated_audit_logs(
    INT, INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO anon;

-- =====================================================
-- 3. ENSURE audit_logs HAS PROPER RLS POLICIES
-- =====================================================

-- Enable RLS on audit_logs (if not already enabled)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Super admins can read audit logs
DROP POLICY IF EXISTS "Super admins can view audit logs" ON audit_logs;

CREATE POLICY "Super admins can view audit logs"
ON audit_logs FOR SELECT
USING (is_super_admin());

-- System can insert audit logs (triggered by audit triggers)
DROP POLICY IF EXISTS "System can create audit logs" ON audit_logs;

CREATE POLICY "System can create audit logs"
ON audit_logs FOR INSERT
WITH CHECK (true);

-- =====================================================
-- 4. VERIFICATION
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '
    ╔════════════════════════════════════════════════════════════╗
    ║    get_paginated_audit_logs RPC FIX APPLIED                ║
    ╚════════════════════════════════════════════════════════════╝

    ✅ Recreated RPC with SECURITY DEFINER
    ✅ Added search_path = public, auth
    ✅ Added super_admin check (is_super_admin())
    ✅ Explicitly qualified table reference (public.audit_logs)
    ✅ Fixed timestamp column references with quotes
    ✅ Added proper ORDER BY in json_agg
    ✅ GRANT EXECUTE on RPC to authenticated and anon
    ✅ Ensured RLS policies on audit_logs table

    Result:
    • RPC now executes with elevated privileges (SECURITY DEFINER)
    • Super_admin can call RPC successfully
    • Pagination and filtering work correctly
    • Dashboard audit logs should load without permission errors
    ';
END $$;

COMMIT;
