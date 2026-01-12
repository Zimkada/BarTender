-- =====================================================
-- FIX: is_super_admin() to check bar_members.role instead of auth.users.is_super_admin
-- =====================================================
-- Date: 2026-01-12
-- Problem: auth.users.is_super_admin doesn't exist, users table has no role column
-- Solution: Check bar_members.role = 'super_admin' instead

BEGIN;

-- =====================================================
-- 1. CREATE OR REPLACE is_super_admin() FUNCTION
-- =====================================================
-- Note: Using CREATE OR REPLACE instead of DROP to avoid breaking dependent policies

CREATE OR REPLACE FUNCTION is_super_admin() RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT bm.role = 'super_admin'
     FROM bar_members bm
     WHERE bm.user_id = auth.uid()
       AND bm.is_active = true
     LIMIT 1),
    false
  );
$$ LANGUAGE SQL STABLE;

COMMENT ON FUNCTION is_super_admin IS
'Check if current user has role = super_admin in bar_members table.
SECURITY DEFINER allows reliable role checking.
Used by RLS policies and admin RPCs.';

-- =====================================================
-- 2. GRANT PERMISSIONS
-- =====================================================

GRANT EXECUTE ON FUNCTION is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION is_super_admin() TO anon;

-- =====================================================
-- 3. VERIFICATION
-- =====================================================

DO $$
DECLARE
    v_super_admin_count INT;
    v_current_user_role TEXT;
    v_current_user_is_super_admin BOOLEAN;
BEGIN
    RAISE NOTICE '
    ╔════════════════════════════════════════════════════════════╗
    ║         FIX is_super_admin() - Phase 10 Hotfix            ║
    ╚════════════════════════════════════════════════════════════╝
    ';

    -- Count super_admins in bar_members table
    SELECT COUNT(*) INTO v_super_admin_count
    FROM bar_members
    WHERE role = 'super_admin' AND is_active = true;

    RAISE NOTICE '✅ Super_admins in bar_members table: %', v_super_admin_count;

    -- Check current user's role
    IF auth.uid() IS NOT NULL THEN
        SELECT role INTO v_current_user_role
        FROM bar_members
        WHERE user_id = auth.uid()
          AND is_active = true
        LIMIT 1;

        RAISE NOTICE 'Current user role: %', COALESCE(v_current_user_role, 'NULL');

        -- Test is_super_admin() function
        SELECT is_super_admin() INTO v_current_user_is_super_admin;
        RAISE NOTICE 'is_super_admin() result: %', v_current_user_is_super_admin;

        IF v_current_user_role = 'super_admin' AND v_current_user_is_super_admin THEN
            RAISE NOTICE '✅ SUCCESS: is_super_admin() working correctly';
        ELSIF v_current_user_role = 'super_admin' AND NOT v_current_user_is_super_admin THEN
            RAISE EXCEPTION 'FAILURE: is_super_admin() returned false for super_admin user';
        ELSE
            RAISE NOTICE '✅ is_super_admin() correctly returned false for non-super_admin';
        END IF;
    ELSE
        RAISE NOTICE '⚠️  No authenticated user - cannot test function';
    END IF;

    RAISE NOTICE '
    Next steps:
    • Test admin_generate_bar_report() RPC with super_admin account
    • Test admin_get_bar_audit_logs() RPC with super_admin account
    • Verify non-super_admin accounts are blocked
    ';
END $$;

COMMIT;
