-- Migration: Rollback pending sales expiration (SQL approach removed)
-- Description: Removes expire_old_pending_sales() function and pg_cron job
-- Reason: Frontend-only approach is better (adapts to each bar's closingHour)
-- Author: Claude Code
-- Date: 2026-01-14

-- ============================================================================
-- REMOVE PG_CRON JOB (if exists)
-- ============================================================================

DO $$
BEGIN
  -- Check if pg_cron is available and job exists
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'expire-pending-sales-daily'
    ) THEN
      PERFORM cron.unschedule('expire-pending-sales-daily');
      RAISE NOTICE 'Successfully unscheduled job: expire-pending-sales-daily';
    ELSE
      RAISE NOTICE 'Job expire-pending-sales-daily does not exist (already removed or never created)';
    END IF;
  ELSE
    RAISE NOTICE 'pg_cron extension not available (Free Tier), no job to remove';
  END IF;
END;
$$;

-- ============================================================================
-- REMOVE FUNCTION
-- ============================================================================

DROP FUNCTION IF EXISTS expire_old_pending_sales();

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Verify job removed:
-- SELECT * FROM cron.job WHERE jobname = 'expire-pending-sales-daily';
-- Should return: 0 rows

-- Verify function removed:
-- SELECT proname FROM pg_proc WHERE proname = 'expire_old_pending_sales';
-- Should return: 0 rows

-- ============================================================================
-- NOTES
-- ============================================================================

-- Frontend filter in DailyDashboard.tsx (lines 231-245) is maintained
-- This approach is better because:
-- 1. Adapts to each bar's closingHour setting automatically
-- 2. No pg_cron dependency (works in Free Tier)
-- 3. Simpler architecture
-- 4. No need to restore stock (sales never leave pending status in DB)
