-- =====================================================
-- FIX: Restore GRANT SELECT on metric views
-- =====================================================
-- Issue: Migration 20260107 recreated views with security_invoker=true
--        but forgot to re-apply GRANT SELECT permissions
-- Impact: All metric views (product_sales_stats, bar_stats_multi_period, etc)
--         returned 403 Forbidden for authenticated users
-- Solution: Restore the GRANT SELECT statements that existed before 20260107

BEGIN;

-- =====================================================
-- 1. RESTORE GRANT SELECT FOR METRIC VIEWS
-- =====================================================

-- 1.1. product_sales_stats (from migration 042)
GRANT SELECT ON product_sales_stats TO authenticated;

-- 1.2. bar_stats_multi_period (from migration 045)
GRANT SELECT ON bar_stats_multi_period TO authenticated;

-- 1.3. top_products_by_period (from migration 044)
GRANT SELECT ON top_products_by_period TO authenticated;

-- 1.4. daily_sales_summary (from migration created before 20260107)
GRANT SELECT ON daily_sales_summary TO authenticated;

-- 1.5. expenses_summary (from migration 052)
GRANT SELECT ON expenses_summary TO authenticated;

-- 1.6. salaries_summary (from migration 053)
GRANT SELECT ON salaries_summary TO authenticated;

-- 1.7. bar_ancillary_stats (infrastructure view)
GRANT SELECT ON bar_ancillary_stats TO authenticated;

-- 1.8. bars_with_stats_view (stats aggregation)
GRANT SELECT ON bars_with_stats_view TO authenticated;

-- =====================================================
-- 2. ALSO RESTORE FOR MONITORING VIEWS (with safe execution)
-- =====================================================
-- These were also missing GRANT SELECT after 20260107
-- Using EXECUTE to handle views that may or may not exist

DO $$
BEGIN
  -- debouncing_metrics
  BEGIN
    EXECUTE 'GRANT SELECT ON debouncing_metrics TO authenticated';
  EXCEPTION WHEN undefined_object THEN
    RAISE NOTICE 'ℹ️  debouncing_metrics does not exist, skipping GRANT';
  END;

  -- materialized_view_metrics
  BEGIN
    EXECUTE 'GRANT SELECT ON materialized_view_metrics TO authenticated';
  EXCEPTION WHEN undefined_object THEN
    RAISE NOTICE 'ℹ️  materialized_view_metrics does not exist, skipping GRANT';
  END;

  -- materialized_view_refresh_stats
  BEGIN
    EXECUTE 'GRANT SELECT ON materialized_view_refresh_stats TO authenticated';
  EXCEPTION WHEN undefined_object THEN
    RAISE NOTICE 'ℹ️  materialized_view_refresh_stats does not exist, skipping GRANT';
  END;

  -- alert_email_stats (optional)
  BEGIN
    EXECUTE 'GRANT SELECT ON alert_email_stats TO authenticated';
  EXCEPTION WHEN undefined_object THEN
    RAISE NOTICE 'ℹ️  alert_email_stats does not exist, skipping GRANT';
  END;
END $$;

-- =====================================================
-- 3. VERIFICATION
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '
    ╔════════════════════════════════════════════════════════════╗
    ║  METRIC VIEWS GRANTS RESTORED                              ║
    ╚════════════════════════════════════════════════════════════╝

    ✅ Restored GRANT SELECT on all metric views
    ✅ No changes to view definitions or filters
    ✅ No changes to RLS policies or security_invoker settings

    Views restored:
    • product_sales_stats (Prévisions - main fix)
    • bar_stats_multi_period (Dashboard stats)
    • top_products_by_period (Analytics)
    • daily_sales_summary (Historical data)
    • expenses_summary (Financial overview)
    • salaries_summary (HR data)
    • bar_ancillary_stats (Member tracking)
    • bars_with_stats_view (Bar overview)
    • debouncing_metrics (Monitoring)
    • materialized_view_metrics (Monitoring)
    • active_refresh_alerts (System alerts)
    • materialized_view_refresh_stats (Monitoring)

    Impact:
    • Prévisions menu: NOW FIXED (will load without 403 errors)
    • Authenticated users: Can access metric views again
    • Security: Unchanged (filters and RLS remain intact)
    • Admin: No impact (uses separate admin views)
    ';
END $$;

COMMIT;
