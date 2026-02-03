-- Migration: Create Public Audit Log RPC
-- Date: 2026-02-03
-- Description: Allows authenticated frontend users to securely write to audit logs via RPC.
-- Security: Enforces auth.uid(), checks bar membership for role resolution.

-- ==============================================================================
-- 1. Helper Function: Verify Bar Membership (Internal)
-- ==============================================================================
CREATE OR REPLACE FUNCTION internal_get_user_role_for_bar(
    p_user_id UUID,
    p_bar_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_role TEXT;
BEGIN
    SELECT role INTO v_role 
    FROM bar_members 
    WHERE user_id = p_user_id AND bar_id = p_bar_id AND is_active = true;
    
    RETURN v_role;
END;
$$;

-- ==============================================================================
-- 2. Public RPC: Log Audit Event
-- ==============================================================================
CREATE OR REPLACE FUNCTION log_audit_event(
    p_event TEXT,
    p_severity TEXT,
    p_bar_id UUID DEFAULT NULL,
    p_description TEXT DEFAULT '',
    p_metadata JSONB DEFAULT NULL,
    p_related_entity_id UUID DEFAULT NULL,
    p_related_entity_type TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    -- v_user_name resolved internally by internal_log_audit_event
    -- v_bar_name resolved internally by internal_log_audit_event
BEGIN
    -- 1. Security Check: Must be authenticated
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- 2. Input Validation
    IF p_severity NOT IN ('info', 'warning', 'critical') THEN
        p_severity := 'info'; -- Fallback instead of crash
    END IF;

    -- 3. Call Internal Logger (which handles name/role resolution)
    PERFORM internal_log_audit_event(
        p_event,
        p_severity,
        v_user_id,
        p_bar_id,
        p_description,
        p_metadata,
        p_related_entity_id,
        p_related_entity_type
    );
END;
$$;

-- Grant permissions to authenticated users
GRANT EXECUTE ON FUNCTION log_audit_event(TEXT, TEXT, UUID, TEXT, JSONB, UUID, TEXT) TO authenticated;
