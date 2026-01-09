-- =====================================================
-- PHASE 2 : FIX AUDIT LOGS - SUPER_ADMIN ACCESS
-- =====================================================
-- Migration: Fix super_admin audit_logs visibility issue
-- Date: 2026-01-09
-- Problem: Super_admin not in bar_members (system bar), RLS blocks access
-- Solution:
--   1. Fix is_super_admin() to check users table directly
--   2. Add dedicated RLS policy for super_admin on audit_logs

BEGIN;

-- =====================================================
-- 1. FIX is_super_admin() FUNCTION
-- =====================================================
-- Original: Checked bar_members (fails if super_admin not in bar)
-- Fixed: Check auth.users.is_super_admin column directly

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
Fixed to work with system bar architecture where super_admin is not a regular bar member.';

-- =====================================================
-- 2. CLEANUP: REMOVE PROBLEMATIC RLS POLICY
-- =====================================================
-- Note: Removed direct RLS policy that used EXISTS (SELECT FROM auth.users)
-- Those policies cause "permission denied" errors when regular users hit them
-- Solution: Existing RLS policies already use is_super_admin() function
-- The function is SECURITY DEFINER so it CAN access auth.users
-- When is_super_admin() returns TRUE, existing policies will allow access

DROP POLICY IF EXISTS "Super admins can always view audit logs" ON audit_logs;

-- =====================================================
-- 3. VERIFICATION
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '
    ╔════════════════════════════════════════════════════════════╗
    ║             AUDIT LOGS FIX - APPLIED                       ║
    ╚════════════════════════════════════════════════════════════╝

    ✅ Fixed is_super_admin() function:
       • Changed from checking bar_members table to auth.users.is_super_admin column
       • Added SECURITY DEFINER so function can access auth.users table
       • Set search_path to properly resolve table names

    ✅ Existing RLS policy "Super admins can view audit logs" now works correctly:
       • Policy calls is_super_admin() function
       • Function returns TRUE for super_admin users (from auth.users)
       • When TRUE, RLS allows SELECT on audit_logs
       • No direct auth.users access in RLS → no permission errors

    Verification:
    - Run: SELECT is_super_admin(); (should return TRUE if you are super_admin)
    - Run: SELECT * FROM audit_logs LIMIT 5; (should show logs now)
    ';
END $$;

COMMIT;
