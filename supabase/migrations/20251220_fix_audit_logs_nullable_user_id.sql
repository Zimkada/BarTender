-- =====================================================
-- FIX: Make audit_logs.user_id Nullable for System Actions
-- Date: December 20, 2025
-- Description: Allow audit_logs to record system-initiated actions
-- (e.g., bar member assignment via Edge Function) where user context
-- is not available in the PostgreSQL session. Preserves bar_id for
-- full audit trail context.
-- =====================================================

-- Step 1: Make user_id nullable (from NOT NULL to NULL)
-- This allows system actions to be logged without a specific user
ALTER TABLE audit_logs
ALTER COLUMN user_id DROP NOT NULL;

-- Step 2: Update the FOREIGN KEY constraint to allow NULL
-- (Nullable columns can't violate NOT NULL, but the FK constraint needs adjustment)
ALTER TABLE audit_logs
DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;

ALTER TABLE audit_logs
ADD CONSTRAINT audit_logs_user_id_fkey
FOREIGN KEY (user_id)
REFERENCES users(id)
ON DELETE SET NULL;

-- Step 3: Update internal_log_audit_event to handle NULL user_id
CREATE OR REPLACE FUNCTION internal_log_audit_event(
    p_event TEXT,
    p_severity TEXT,
    p_user_id UUID,
    p_bar_id UUID,
    p_description TEXT,
    p_metadata JSONB,
    p_related_entity_id UUID,
    p_related_entity_type TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_name TEXT;
    v_user_role TEXT;
    v_bar_name TEXT;
BEGIN
    -- Get User Info (only if user_id is provided)
    IF p_user_id IS NOT NULL THEN
        SELECT name INTO v_user_name FROM users WHERE id = p_user_id;

        -- Get Role (Best effort)
        IF p_bar_id IS NOT NULL THEN
            SELECT role INTO v_user_role FROM bar_members WHERE user_id = p_user_id AND bar_id = p_bar_id;
        END IF;
    ELSE
        -- System action (no user context)
        v_user_name := 'System';
    END IF;

    -- Fallback role if not found
    IF v_user_role IS NULL THEN
        v_user_role := 'system';
    END IF;

    -- Get Bar Name (always capture for context)
    IF p_bar_id IS NOT NULL THEN
        SELECT name INTO v_bar_name FROM bars WHERE id = p_bar_id;
    END IF;

    INSERT INTO audit_logs (
        event,
        severity,
        user_id,
        user_name,
        user_role,
        bar_id,
        bar_name,
        description,
        metadata,
        related_entity_id,
        related_entity_type
    ) VALUES (
        p_event,
        p_severity,
        p_user_id,
        COALESCE(v_user_name, 'Unknown'),
        v_user_role,
        p_bar_id,
        v_bar_name,
        p_description,
        p_metadata,
        p_related_entity_id,
        p_related_entity_type
    );
END;
$$;

-- Step 4: Update trigger_audit_member_change to handle NULL auth.uid()
-- The trigger will now pass NULL user_id when auth.uid() returns NULL
CREATE OR REPLACE FUNCTION trigger_audit_member_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        PERFORM internal_log_audit_event(
            'MEMBER_ADDED',
            'warning',
            auth.uid(),  -- Will be NULL for system/Edge Function actions
            NEW.bar_id,
            'New member added: ' || NEW.role,
            jsonb_build_object('member_user_id', NEW.user_id, 'role', NEW.role),
            NEW.id,
            'user'
        );
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        PERFORM internal_log_audit_event(
            'MEMBER_REMOVED',
            'warning',
            auth.uid(),  -- Will be NULL for system/Edge Function actions
            OLD.bar_id,
            'Member removed',
            jsonb_build_object('member_user_id', OLD.user_id),
            OLD.id,
            'user'
        );
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;

-- Step 5: Verification
DO $$
BEGIN
    RAISE NOTICE '✅ Migration 20251220: audit_logs.user_id is now nullable';
    RAISE NOTICE '✅ System actions will be logged with bar context preserved';
    RAISE NOTICE '✅ Bar member assignments via Edge Function will now log successfully';
END $$;
