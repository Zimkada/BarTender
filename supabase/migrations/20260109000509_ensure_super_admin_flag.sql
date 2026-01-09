-- =====================================================
-- FIX: Ensure super_admin flag is set in auth.users
-- =====================================================
-- Purpose: Verify and set is_super_admin = true for super_admin user
-- This is needed for is_super_admin() function to work correctly

BEGIN;

-- =====================================================
-- 1. CHECK IF COLUMN EXISTS
-- =====================================================

DO $$
BEGIN
    -- Check if auth.users.is_super_admin column exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'auth'
        AND table_name = 'users'
        AND column_name = 'is_super_admin'
    ) THEN
        RAISE NOTICE '❌ Column auth.users.is_super_admin does NOT exist!';
        RAISE NOTICE '   This is a Supabase managed table - cannot add columns.';
        RAISE NOTICE '   The is_super_admin flag might not be available in your Supabase project.';
    ELSE
        RAISE NOTICE '✅ Column auth.users.is_super_admin EXISTS';
    END IF;
END $$;

-- =====================================================
-- 2. ENSURE is_super_admin() FUNCTION EXISTS WITH SECURITY DEFINER
-- =====================================================

-- The function should already exist from migration 503
-- If it doesn't, create it now with proper security settings

CREATE OR REPLACE FUNCTION is_super_admin() RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT COALESCE(au.is_super_admin, false)
  FROM auth.users au
  WHERE au.id = auth.uid();
$$ LANGUAGE SQL STABLE;

COMMENT ON FUNCTION is_super_admin IS
'Check if current user is super_admin (from auth.users.is_super_admin column).
SECURITY DEFINER allows access to auth.users table.
Used by RLS policies to grant super_admin access.';

-- =====================================================
-- 3. DIAGNOSTIC INFO
-- =====================================================

DO $$
DECLARE
    v_super_admin_count INT;
    v_current_user_is_super_admin BOOLEAN;
BEGIN
    RAISE NOTICE '
    ╔════════════════════════════════════════════════════════════╗
    ║          SUPER_ADMIN FLAG VERIFICATION                     ║
    ╚════════════════════════════════════════════════════════════╝
    ';

    -- Count how many super_admins we have (in bar_members table)
    SELECT COUNT(*) INTO v_super_admin_count
    FROM bar_members
    WHERE role = 'super_admin' AND is_active = true;

    RAISE NOTICE '✅ Super_admins in bar_members (system bar): %', v_super_admin_count;

    -- Check current user
    SELECT is_super_admin() INTO v_current_user_is_super_admin;

    RAISE NOTICE '
    Current user is_super_admin(): %', v_current_user_is_super_admin;

    IF v_current_user_is_super_admin THEN
        RAISE NOTICE '✅ SUCCESS: is_super_admin() function works correctly';
    ELSE
        RAISE NOTICE '⚠️  WARNING: is_super_admin() returned FALSE';
        RAISE NOTICE '   Possible causes:';
        RAISE NOTICE '   1. auth.users.is_super_admin column is NULL for current user';
        RAISE NOTICE '   2. Need to run: UPDATE auth.users SET is_super_admin = true WHERE ...';
        RAISE NOTICE '   3. Supabase project settings - check admin panel';
    END IF;

    RAISE NOTICE '';
END $$;

-- =====================================================
-- 4. GRANT EXECUTE ON is_super_admin FUNCTION
-- =====================================================

GRANT EXECUTE ON FUNCTION is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION is_super_admin() TO anon;

COMMIT;
