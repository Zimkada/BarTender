-- =====================================================
-- Complete Realtime Fix
-- Date: 2025-12-19
--
-- Problem: "Unable to subscribe to changes with given parameters"
-- Solution: Ensure REPLICA IDENTITY FULL on all tables + force refresh
-- =====================================================

-- Step 1: Ensure REPLICA IDENTITY FULL on all critical tables
ALTER TABLE public.sales REPLICA IDENTITY FULL;
ALTER TABLE public.bar_products REPLICA IDENTITY FULL;
ALTER TABLE public.supplies REPLICA IDENTITY FULL;
ALTER TABLE public.consignments REPLICA IDENTITY FULL;
ALTER TABLE public.users REPLICA IDENTITY FULL;
ALTER TABLE public.bar_members REPLICA IDENTITY FULL;

-- Step 2: Verify REPLICA IDENTITY is set correctly
-- Run this query to verify (should show all as 'FULL'):
/*
SELECT
  schemaname,
  tablename,
  CASE
    WHEN relreplident = 'f' THEN 'DEFAULT'
    WHEN relreplident = 'i' THEN 'USING INDEX'
    WHEN relreplident = 'n' THEN 'NOTHING'
    WHEN relreplident = 'c' THEN 'FULL'
  END as replica_identity
FROM pg_class
JOIN pg_tables ON pg_class.relname = pg_tables.tablename
WHERE schemaname = 'public'
  AND tablename IN ('sales', 'bar_products', 'supplies', 'consignments', 'users', 'bar_members')
ORDER BY tablename;
*/

-- Step 3: Clear the schema cache by doing a trivial change
-- This forces Supabase to refresh its internal schema cache
-- (This is sometimes needed after ALTER TABLE changes)
NOTIFY pgrst, 'reload schema';
