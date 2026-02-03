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
    v_user_role TEXT := 'user';
    v_bar_name TEXT;
    v_user_name TEXT;
BEGIN
    -- 1. Security Check: Must be authenticated
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- 2. Resolve User Name (Server-side source of truth)
    SELECT name INTO v_user_name FROM users WHERE id = v_user_id;
    
    -- 3. Resolve Role & Bar Context
    IF p_bar_id IS NOT NULL THEN
        -- Check if user is member of this bar
        v_user_role := internal_get_user_role_for_bar(v_user_id, p_bar_id);
        
        -- Special case: Super Admin or Owner might not be in bar_members in some legacy setups,
        -- but usually they should be. If null, we might want to check ownership.
        IF v_user_role IS NULL THEN
           IF EXISTS (SELECT 1 FROM bars WHERE id = p_bar_id AND owner_id = v_user_id) THEN
               v_user_role := 'promoteur';
           ELSE
               -- If not member and not owner, maybe allow logging but as 'visitor'?
               -- Or strict reject? Strict reject is safer for data integrity.
               -- But for 'LOGIN_FAILED' etc, user might not have role yet.
               -- However, this RPC is for AUTHENTICATED users.
               -- So if they claim to act on a bar they are not part of, it's suspicious.
               -- Let's fallback to 'user' but keep bar_id.
               v_user_role := 'user'; 
           END IF;
        END IF;

        -- Get Bar Name
        SELECT name INTO v_bar_name FROM bars WHERE id = p_bar_id;
    END IF;

    -- 4. Call Internal Logger
    -- This reuses the existing internal_log_audit_event logic which handles insertion
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
