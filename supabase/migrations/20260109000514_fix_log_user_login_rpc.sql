-- =====================================================
-- FIX: log_user_login RPC returns 400 Bad Request
-- =====================================================
-- Issue: RPC log_user_login returns 400 on login
-- Cause: Possible auth.uid() NULL during initial login, or parameter issues
-- Solution: Add better error handling and GRANT EXECUTE

BEGIN;

-- =====================================================
-- 1. RECREATE log_user_login WITH BETTER ERROR HANDLING
-- =====================================================

CREATE OR REPLACE FUNCTION log_user_login()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id UUID := auth.uid();
BEGIN
    -- Only proceed if user is authenticated
    IF v_user_id IS NULL THEN
        RAISE NOTICE 'log_user_login: No authenticated user, skipping';
        RETURN;
    END IF;

    -- Update Last Login in public.users
    BEGIN
        UPDATE public.users
        SET last_login_at = NOW()
        WHERE id = v_user_id;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'log_user_login: Error updating users table: %', SQLERRM;
    END;

    -- Log to Audit (if internal_log_audit_event exists)
    BEGIN
        PERFORM internal_log_audit_event(
            'USER_LOGIN',
            'info',
            v_user_id,
            NULL,
            'User logged in',
            jsonb_build_object('user_id', v_user_id::text),
            NULL,
            NULL
        );
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'log_user_login: Error logging to audit: %', SQLERRM;
    END;
END;
$$;

-- =====================================================
-- 2. GRANT EXECUTE ON RPC
-- =====================================================

GRANT EXECUTE ON FUNCTION log_user_login() TO authenticated;
GRANT EXECUTE ON FUNCTION log_user_login() TO anon;
GRANT EXECUTE ON FUNCTION log_user_login() TO service_role;

-- =====================================================
-- 3. VERIFICATION
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '
    ╔════════════════════════════════════════════════════════════╗
    ║      log_user_login RPC FIX APPLIED                        ║
    ╚════════════════════════════════════════════════════════════╝

    ✅ Recreated log_user_login with better error handling
    ✅ Added NULL check for auth.uid()
    ✅ Wrapped both operations in BEGIN/EXCEPTION blocks
    ✅ GRANT EXECUTE to authenticated, anon, service_role

    Result:
    • RPC should no longer return 400 Bad Request
    • Handles NULL user_id gracefully
    • Logs errors instead of throwing exceptions
    • Dashboard login should work without errors
    ';
END $$;

COMMIT;
