-- ========================================================================
-- FINAL FIX V4: Drop ambiguous old function signature
-- ========================================================================
-- Problem: The previous migration created a new function instead of replacing
--          the old one, leading to an "ambiguous function" error.
-- Solution: Explicitly DROP the old function signature before creating the new one.
-- ========================================================================

-- Drop the old, single-argument function to resolve ambiguity
DROP FUNCTION IF EXISTS get_dashboard_stats(TEXT);
-- Drop the new function signature as well to ensure a clean slate
DROP FUNCTION IF EXISTS get_dashboard_stats(TEXT, UUID);

-- Recreate the function with the final logic for all periods
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

    -- Total Bars (not period-dependent)
    (SELECT COUNT(*) FROM bars b WHERE b.is_active = true)::BIGINT,

    -- Active Bars (not period-dependent)
    (SELECT COUNT(DISTINCT bm.bar_id) FROM bar_members bm WHERE bm.is_active = true)::BIGINT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_dashboard_stats(TEXT, UUID) TO authenticated;

-- Add a comment to explain the final version of the function
COMMENT ON FUNCTION get_dashboard_stats(TEXT, UUID) IS
'Get global dashboard statistics. V5, resolves ambiguity error.';
