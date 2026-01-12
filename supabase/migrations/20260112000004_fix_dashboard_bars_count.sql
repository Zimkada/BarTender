-- =====================================================
-- FIX: Dashboard bars_count showing negative suspended bars
-- =====================================================
-- Date: 2026-01-12
-- Problem: bars_count counts only active bars, but active_bars_count counts
--          bars with active members, leading to negative suspended count
-- Solution: bars_count should count ALL bars, active_bars_count only active ones

BEGIN;

-- Drop existing function
DROP FUNCTION IF EXISTS get_dashboard_stats(TEXT, UUID);

-- Recreate with correct logic
CREATE OR REPLACE FUNCTION get_dashboard_stats(p_period TEXT DEFAULT '1 day', p_cache_buster UUID DEFAULT gen_random_uuid())
RETURNS TABLE (
  total_revenue NUMERIC,
  sales_count BIGINT,
  active_users_count BIGINT,
  new_users_count BIGINT,
  bars_count BIGINT,
  active_bars_count BIGINT
) AS $$
DECLARE
  v_closing_hour INT := 6;
  v_period_days INT;
  v_start_ts TIMESTAMPTZ;
  v_end_ts TIMESTAMPTZ;
  v_today_business_start_ts TIMESTAMPTZ;
BEGIN
  -- Robustly parse the period string to get the number of days
  v_period_days := CAST(regexp_replace(p_period, '\D', '', 'g') AS INT);

  -- 1. Determine the exact start timestamp of the *current* business day
  v_today_business_start_ts := date_trunc('day', NOW() AT TIME ZONE 'UTC') + (v_closing_hour || ' hours')::interval;
  IF (NOW() AT TIME ZONE 'UTC' < v_today_business_start_ts) THEN
    v_today_business_start_ts := v_today_business_start_ts - '1 day'::interval;
  END IF;

  -- 2. Define the time range based on the period
  IF p_period = '0 days' THEN
    -- "Today" period: from the start of the current business day until now
    v_start_ts := v_today_business_start_ts;
    v_end_ts := NOW() AT TIME ZONE 'UTC';
  ELSE
    -- "N-days" period: a window of N full days ending at the start of the current business day
    v_end_ts := v_today_business_start_ts;
    v_start_ts := v_end_ts - (v_period_days || ' days')::interval;
  END IF;

  RETURN QUERY
  SELECT
    -- Total Revenue:
    (SELECT COALESCE(SUM(s.total), 0) FROM sales s
      WHERE s.status = 'validated'
      AND s.created_at >= v_start_ts AND s.created_at < v_end_ts)::NUMERIC,

    -- Sales Count:
    (SELECT COUNT(*) FROM sales s
      WHERE s.status = 'validated'
      AND s.created_at >= v_start_ts AND s.created_at < v_end_ts)::BIGINT,

    -- Active Users:
    (SELECT COUNT(DISTINCT u.id) FROM public.users u JOIN auth.users auth_u ON u.id = auth_u.id
      WHERE u.is_active = true
      AND auth_u.last_sign_in_at IS NOT NULL
      AND auth_u.last_sign_in_at >= v_start_ts AND auth_u.last_sign_in_at < v_end_ts)::BIGINT,

    -- New Users:
    (SELECT COUNT(*) FROM users u
      WHERE u.is_active = true
      AND u.created_at >= v_start_ts AND u.created_at < v_end_ts)::BIGINT,

    -- FIXED: Total Bars (ALL bars, including suspended ones)
    (SELECT COUNT(*) FROM bars)::BIGINT,

    -- FIXED: Active Bars (only bars with is_active = true)
    (SELECT COUNT(*) FROM bars b WHERE b.is_active = true)::BIGINT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_dashboard_stats(TEXT, UUID) TO authenticated;

-- Add comment
COMMENT ON FUNCTION get_dashboard_stats(TEXT, UUID) IS
'Get global dashboard statistics. V6: Fixed bars_count to include ALL bars (active + suspended).';

-- =====================================================
-- VERIFICATION
-- =====================================================

DO $$
DECLARE
    v_total_bars INT;
    v_active_bars INT;
    v_suspended_bars INT;
BEGIN
    RAISE NOTICE '
    ╔════════════════════════════════════════════════════════════╗
    ║      FIX Dashboard Bars Count - Phase 10 Hotfix           ║
    ╚════════════════════════════════════════════════════════════╝
    ';

    -- Count bars directly
    SELECT COUNT(*) INTO v_total_bars FROM bars;
    SELECT COUNT(*) INTO v_active_bars FROM bars WHERE is_active = true;
    v_suspended_bars := v_total_bars - v_active_bars;

    RAISE NOTICE '✅ Total bars: %', v_total_bars;
    RAISE NOTICE '✅ Active bars: %', v_active_bars;
    RAISE NOTICE '✅ Suspended bars: %', v_suspended_bars;

    IF v_suspended_bars < 0 THEN
        RAISE EXCEPTION 'FAILURE: Negative suspended bars count!';
    ELSE
        RAISE NOTICE '✅ SUCCESS: Bars count logic is correct';
    END IF;

    RAISE NOTICE '
    Next steps:
    • Refresh SuperAdmin dashboard to see corrected counts
    • Verify suspended bars count is no longer negative
    ';
END $$;

COMMIT;
