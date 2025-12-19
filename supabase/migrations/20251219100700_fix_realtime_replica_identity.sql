-- =====================================================
-- Fix Realtime Subscription Issues
-- Date: 2025-12-19
--
-- Problem: Realtime subscriptions failing with:
-- "Unable to subscribe to changes with given parameters"
--
-- Root Cause: REPLICA IDENTITY needs to be set correctly
-- and filters must use valid PostgREST syntax
-- =====================================================

-- Ensure REPLICA IDENTITY is FULL for all critical tables
ALTER TABLE public.sales REPLICA IDENTITY FULL;
ALTER TABLE public.bar_products REPLICA IDENTITY FULL;
ALTER TABLE public.supplies REPLICA IDENTITY FULL;
ALTER TABLE public.consignments REPLICA IDENTITY FULL;

-- Verify REPLICA IDENTITY is set (should show 'c' = FULL)
-- SELECT schemaname, tablename,
--   CASE
--     WHEN relreplident = 'f' THEN 'DEFAULT'
--     WHEN relreplident = 'i' THEN 'USING INDEX'
--     WHEN relreplident = 'n' THEN 'NOTHING'
--     WHEN relreplident = 'c' THEN 'FULL'
--   END as replica_identity
-- FROM pg_class
-- JOIN pg_tables ON pg_class.relname = pg_tables.tablename
-- WHERE schemaname = 'public'
--   AND tablename IN ('sales', 'bar_products', 'supplies', 'consignments');

-- Force schema cache refresh in Supabase
-- This is typically done automatically, but sometimes needs explicit refresh
