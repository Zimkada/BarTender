-- =====================================================
-- RLS POLICY VALIDATION TEST
-- =====================================================
-- Date: 2026-02-23
-- Purpose: Validate Bug #2 Fix (RLS LIMIT 1 -> EXISTS)
-- Run in: Supabase SQL Editor
-- =====================================================

-- Query the pg_policies system table to verify the RLS fix
SELECT
  CASE
    WHEN policyname = 'Managers can validate sales' THEN 'PASS ✅ - RLS Policy exists'
    ELSE 'FAIL ❌ - Policy not found'
  END as result,
  tablename,
  policyname,
  CASE
    WHEN qual LIKE '%EXISTS%' THEN 'Uses EXISTS (Bug #2 FIXED ✅)'
    WHEN qual LIKE '%LIMIT%' THEN 'Uses LIMIT (Bug #2 NOT FIXED ❌)'
    ELSE 'Unknown pattern'
  END as policy_type,
  qual as policy_definition
FROM pg_policies
WHERE tablename = 'sales'
AND policyname = 'Managers can validate sales'
AND schemaname = 'public';
