-- Migration: Fix refresh triggers for Supabase free tier (no pg_cron)
-- Description:
--   On the free tier, pg_cron is not available. All existing trigger functions
--   only send pg_notify signals with no listener → materialized views are NEVER
--   auto-refreshed after data changes.
--
--   The only refresh points were:
--     - App startup cache warming (useCacheWarming hook)
--     - Manual refresh button in AccountingOverview
--
--   Fix: Replace PERFORM pg_notify(...) with a direct call to each view's
--   dedicated SECURITY DEFINER refresh function. The debounce logic (checking
--   materialized_view_refresh_log for last refresh time) is preserved, so
--   refresh frequency is unchanged — only the delivery mechanism changes.
--
--   Debounce windows (unchanged from migration 057):
--     daily_sales_summary  : 10 minutes
--     product_sales_stats  : 10 minutes
--     expenses_summary     : 15 minutes
--     salaries_summary     : 30 minutes

-- ============================================================================
-- 1. daily_sales_summary  (debounce: 10 min)
-- ============================================================================
CREATE OR REPLACE FUNCTION trigger_refresh_daily_summary()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_last_refresh TIMESTAMPTZ;
  v_view_name TEXT := 'daily_sales_summary';
BEGIN
  SELECT MAX(refresh_completed_at) INTO v_last_refresh
  FROM materialized_view_refresh_log
  WHERE view_name = v_view_name AND status = 'completed';

  IF v_last_refresh IS NULL OR v_last_refresh < NOW() - INTERVAL '10 minutes' THEN
    PERFORM refresh_daily_sales_summary();
    RAISE NOTICE '[%] Refreshed (last: %)', v_view_name, COALESCE(v_last_refresh::TEXT, 'never');
  ELSE
    RAISE DEBUG '[%] Skipped (debounced, last: %)', v_view_name, v_last_refresh;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION trigger_refresh_daily_summary IS
  'Trigger débounced 10 min — appel direct (sans pg_cron, plan gratuit)';

-- ============================================================================
-- 2. product_sales_stats  (debounce: 10 min)
-- ============================================================================
CREATE OR REPLACE FUNCTION trigger_refresh_product_stats()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_last_refresh TIMESTAMPTZ;
  v_view_name TEXT := 'product_sales_stats';
BEGIN
  SELECT MAX(refresh_completed_at) INTO v_last_refresh
  FROM materialized_view_refresh_log
  WHERE view_name = v_view_name AND status = 'completed';

  IF v_last_refresh IS NULL OR v_last_refresh < NOW() - INTERVAL '10 minutes' THEN
    PERFORM refresh_product_sales_stats();
    RAISE NOTICE '[%] Refreshed (last: %)', v_view_name, COALESCE(v_last_refresh::TEXT, 'never');
  ELSE
    RAISE DEBUG '[%] Skipped (debounced, last: %)', v_view_name, v_last_refresh;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION trigger_refresh_product_stats IS
  'Trigger débounced 10 min — appel direct (sans pg_cron, plan gratuit)';

-- ============================================================================
-- 3. expenses_summary  (debounce: 15 min)
-- ============================================================================
CREATE OR REPLACE FUNCTION trigger_refresh_expenses_summary()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_last_refresh TIMESTAMPTZ;
  v_view_name TEXT := 'expenses_summary';
BEGIN
  SELECT MAX(refresh_completed_at) INTO v_last_refresh
  FROM materialized_view_refresh_log
  WHERE view_name = v_view_name AND status = 'completed';

  IF v_last_refresh IS NULL OR v_last_refresh < NOW() - INTERVAL '15 minutes' THEN
    PERFORM refresh_expenses_summary();
    RAISE NOTICE '[%] Refreshed (last: %)', v_view_name, COALESCE(v_last_refresh::TEXT, 'never');
  ELSE
    RAISE DEBUG '[%] Skipped (debounced, last: %)', v_view_name, v_last_refresh;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION trigger_refresh_expenses_summary IS
  'Trigger débounced 15 min — appel direct (sans pg_cron, plan gratuit)';

-- ============================================================================
-- 4. salaries_summary  (debounce: 30 min)
-- ============================================================================
CREATE OR REPLACE FUNCTION trigger_refresh_salaries_summary()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_last_refresh TIMESTAMPTZ;
  v_view_name TEXT := 'salaries_summary';
BEGIN
  SELECT MAX(refresh_completed_at) INTO v_last_refresh
  FROM materialized_view_refresh_log
  WHERE view_name = v_view_name AND status = 'completed';

  IF v_last_refresh IS NULL OR v_last_refresh < NOW() - INTERVAL '30 minutes' THEN
    PERFORM refresh_salaries_summary();
    RAISE NOTICE '[%] Refreshed (last: %)', v_view_name, COALESCE(v_last_refresh::TEXT, 'never');
  ELSE
    RAISE DEBUG '[%] Skipped (debounced, last: %)', v_view_name, v_last_refresh;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION trigger_refresh_salaries_summary IS
  'Trigger débounced 30 min — appel direct (sans pg_cron, plan gratuit)';

-- ============================================================================
-- NOTE
-- ============================================================================
-- The pg_notify() approach required an external listener process (pg_cron worker
-- or Supabase Edge Function) to actually execute the refresh. Without pg_cron
-- (free tier), the NOTIFY signal was sent but never consumed → views were never
-- refreshed automatically.
--
-- With direct calls, latency impact on INSERT is minimal because:
--   a) The debounce window skips refresh if last refresh < debounce threshold
--   b) The REFRESH MATERIALIZED VIEW CONCURRENTLY does not block concurrent reads
--   c) expenses/salaries are low-frequency operations
--
-- If pg_cron becomes available (paid tier), this can be reverted to pg_notify
-- and a scheduled job added via cron.schedule().
