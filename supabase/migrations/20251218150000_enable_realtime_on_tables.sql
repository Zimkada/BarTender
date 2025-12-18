-- Enable Realtime on critical tables
-- Phase 3.2 - Supabase Optimization
-- Date: 2025-12-18 15:00:00

/**
 * Enable Realtime (REPLICA IDENTITY FULL) on tables
 * Required for Supabase Realtime subscriptions to work
 *
 * These tables need real-time updates:
 * - sales: New orders and status changes
 * - bar_products: Stock and price changes
 * - supplies: Inventory arrivals
 * - consignments: Consignment status updates
 */

-- Enable Realtime for sales table
ALTER TABLE sales REPLICA IDENTITY FULL;

-- Enable Realtime for bar_products table
ALTER TABLE bar_products REPLICA IDENTITY FULL;

-- Enable Realtime for supplies table
ALTER TABLE supplies REPLICA IDENTITY FULL;

-- Enable Realtime for consignments table
ALTER TABLE consignments REPLICA IDENTITY FULL;

-- =====================================================
-- Verification Query
-- =====================================================

/*
-- Verify Realtime is enabled (REPLICA IDENTITY should be FULL)
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
  AND tablename IN ('sales', 'bar_products', 'supplies', 'consignments')
ORDER BY tablename;
*/
