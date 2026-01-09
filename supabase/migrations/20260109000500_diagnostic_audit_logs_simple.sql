-- =====================================================
-- PHASE 2 : DIAGNOSTIC AUDIT LOGS - VERSION SIMPLE
-- =====================================================
-- Migration: Vérifier l'état du système de audit logging
-- Date: 2026-01-09
-- NOTE: Génère des tables avec résultats consultables
--
-- À exécuter et copier/coller les résultats dans le chat

BEGIN;

-- =====================================================
-- 1. AUDIT_LOGS CONTENT
-- =====================================================
SELECT 'AUDIT_LOGS_CONTENT' as section;

SELECT
  COUNT(*) as total_records,
  COUNT(CASE WHEN event = 'SALE_CREATED' THEN 1 END) as sale_created_count,
  COUNT(CASE WHEN event = 'STOCK_UPDATE' THEN 1 END) as stock_update_count,
  COUNT(CASE WHEN event IN ('MEMBER_ADDED', 'MEMBER_REMOVED') THEN 1 END) as member_changes_count,
  COUNT(CASE WHEN event = 'PROXY_SALE_CREATED' THEN 1 END) as proxy_sales_count
FROM audit_logs;

-- =====================================================
-- 2. SUPER_ADMIN STATUS
-- =====================================================
SELECT 'SUPER_ADMIN_STATUS' as section;

SELECT
  COUNT(*) as total_super_admin,
  COUNT(CASE WHEN is_active = true THEN 1 END) as active_super_admin,
  MAX(CASE WHEN is_active = true THEN user_id::text END) as active_super_admin_id
FROM bar_members
WHERE role = 'super_admin';

-- =====================================================
-- 3. TRIGGERS STATUS
-- =====================================================
SELECT 'TRIGGERS_STATUS' as section;

SELECT
  tgname as trigger_name,
  relname as table_name,
  CASE WHEN tgenabled = 'D' THEN 'DISABLED'
       WHEN tgenabled = 'O' THEN 'ENABLED'
       WHEN tgenabled = 'R' THEN 'REPLICA'
       WHEN tgenabled = 'A' THEN 'ALWAYS'
       ELSE tgenabled::text
  END as status
FROM pg_trigger
JOIN pg_class ON pg_class.oid = pg_trigger.tgrelid
WHERE tgname LIKE 'trg_audit%' OR tgname LIKE 'trigger_audit%'
ORDER BY relname, tgname;

-- =====================================================
-- 4. RLS POLICIES
-- =====================================================
SELECT 'RLS_POLICIES_AUDIT_LOGS' as section;

SELECT
  policyname as policy_name,
  cmd as operation,
  qual as using_clause,
  with_check as with_check_clause
FROM pg_policies
WHERE tablename = 'audit_logs'
ORDER BY cmd;

-- =====================================================
-- 5. LAST 10 AUDIT LOGS
-- =====================================================
SELECT 'LAST_10_AUDIT_LOGS' as section;

SELECT
  timestamp,
  event,
  user_name,
  bar_name,
  description,
  severity
FROM audit_logs
ORDER BY timestamp DESC
LIMIT 10;

-- =====================================================
-- 6. EVENT DISTRIBUTION
-- =====================================================
SELECT 'EVENT_DISTRIBUTION' as section;

SELECT
  event,
  COUNT(*) as count
FROM audit_logs
GROUP BY event
ORDER BY COUNT(*) DESC;

-- =====================================================
-- 7. CORRELATION: SALES vs AUDIT_LOGS
-- =====================================================
SELECT 'CORRELATION_SALES_VS_AUDIT' as section;

SELECT
  (SELECT COUNT(*) FROM sales) as total_sales,
  (SELECT COUNT(*) FROM audit_logs WHERE event = 'SALE_CREATED') as logged_sales,
  (SELECT COUNT(*) FROM sales) -
  (SELECT COUNT(*) FROM audit_logs WHERE event = 'SALE_CREATED') as unlogged_sales;

-- =====================================================
-- 8. IS_SUPER_ADMIN() TEST
-- =====================================================
SELECT 'IS_SUPER_ADMIN_TEST' as section;

SELECT
  auth.uid()::text as current_user_id,
  is_super_admin() as is_super_admin_result;

-- =====================================================
-- 9. TABLE STRUCTURE
-- =====================================================
SELECT 'AUDIT_LOGS_TABLE_STRUCTURE' as section;

SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'audit_logs'
ORDER BY ordinal_position;

-- =====================================================
-- 10. RLS ENABLED CHECK
-- =====================================================
SELECT 'RLS_ENABLED_CHECK' as section;

SELECT
  tablename,
  CASE WHEN rowsecurity THEN 'ENABLED' ELSE 'DISABLED' END as rls_status
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'audit_logs';

COMMIT;
