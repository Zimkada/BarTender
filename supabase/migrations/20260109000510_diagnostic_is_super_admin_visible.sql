-- =====================================================
-- DIAGNOSTIC: is_super_admin() - VISIBLE RESULTS
-- =====================================================
-- Returns actual SELECT results (not just RAISE NOTICE)
-- Shows if is_super_admin() function works

BEGIN;

-- =====================================================
-- 1. TEST is_super_admin() FUNCTION
-- =====================================================

SELECT 'TEST 1: Call is_super_admin()' as section;

SELECT
  auth.uid()::text as current_user_id,
  is_super_admin() as is_super_admin_result,
  NOW() as test_timestamp;

-- =====================================================
-- 2. CHECK auth.users.is_super_admin COLUMN
-- =====================================================

SELECT 'TEST 2: Check auth.users.is_super_admin value' as section;

SELECT
  id::text as user_id,
  email,
  CASE WHEN is_super_admin IS NULL THEN 'NULL'
       WHEN is_super_admin = true THEN 'TRUE'
       ELSE 'FALSE'
  END as is_super_admin_value
FROM auth.users
WHERE id = auth.uid()
LIMIT 1;

-- =====================================================
-- 3. CHECK FUNCTION DEFINITION
-- =====================================================

SELECT 'TEST 3: is_super_admin() function properties' as section;

SELECT
  proname as function_name,
  prosecdef as has_security_definer,
  CASE WHEN provolatile = 's' THEN 'STABLE'
       WHEN provolatile = 'i' THEN 'IMMUTABLE'
       WHEN provolatile = 'v' THEN 'VOLATILE'
       ELSE provolatile::text
  END as volatility,
  proowner::regrole::text as owner
FROM pg_proc
WHERE proname = 'is_super_admin'
LIMIT 1;

-- =====================================================
-- 4. CHECK RLS POLICIES ON audit_logs
-- =====================================================

SELECT 'TEST 4: RLS policies on audit_logs' as section;

SELECT
  policyname as policy_name,
  cmd as operation,
  qual as using_condition,
  with_check as with_check_condition
FROM pg_policies
WHERE tablename = 'audit_logs'
ORDER BY cmd;

-- =====================================================
-- 5. COUNT audit_logs RECORDS VISIBLE
-- =====================================================

SELECT 'TEST 5: audit_logs visibility' as section;

SELECT
  COUNT(*) as total_audit_logs,
  COUNT(CASE WHEN event = 'IMPERSONATE_REQUESTED' THEN 1 END) as impersonate_count,
  COUNT(CASE WHEN event = 'SALE_CREATED' THEN 1 END) as sale_created_count,
  MAX(timestamp) as most_recent_log
FROM audit_logs;

-- =====================================================
-- 6. CHECK bar_members FOR super_admin
-- =====================================================

SELECT 'TEST 6: Super_admin in bar_members' as section;

SELECT
  user_id::text,
  bar_id::text,
  role,
  is_active,
  updated_at
FROM bar_members
WHERE role = 'super_admin'
LIMIT 5;

COMMIT;
