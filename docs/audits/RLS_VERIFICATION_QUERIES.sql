-- =====================================================
-- RLS VERIFICATION QUERIES - Issue #6: RLS Bypass Possible
-- =====================================================

-- 1. List all tables with RLS enabled
SELECT
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND rowsecurity = true
ORDER BY tablename;

-- 2. List all RLS policies and their definitions
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  qual as condition,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 3. Check specific tables for RLS status
SELECT
  tablename,
  (SELECT rowsecurity FROM pg_tables WHERE pg_tables.tablename = t.tablename) as has_rls
FROM (
  SELECT 'global_products' as tablename
  UNION SELECT 'global_categories'
  UNION SELECT 'bar_products'
  UNION SELECT 'bar_categories'
  UNION SELECT 'global_catalog_audit_log'
  UNION SELECT 'audit_logs'
  UNION SELECT 'users'
) t;

-- 4. Get detailed RLS policies for global_catalog_audit_log
SELECT * FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'global_catalog_audit_log';

-- 5. Get detailed RLS policies for global_products
SELECT * FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'global_products';

-- 6. Get detailed RLS policies for bar_products
SELECT * FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'bar_products';

-- 7. Check for SECURITY DEFINER functions that might bypass RLS
SELECT
  n.nspname as schema,
  p.proname as function_name,
  p.prosecdef as security_definer,
  pg_get_functiondef(p.oid) as function_def
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.prosecdef = true
ORDER BY p.proname;

-- 8. Check audit_logs table RLS
SELECT * FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'audit_logs';

-- 9. Count of policies per table
SELECT
  tablename,
  COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;

-- 10. Tables WITHOUT RLS enabled (potential security risk)
SELECT
  tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND rowsecurity = false
ORDER BY tablename;
