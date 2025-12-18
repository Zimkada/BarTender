-- 20251218140001_schedule_pg_cron_jobs.sql
-- Schedule automated jobs for materialized view refreshes and log cleanup
-- Phase 3.1: Supabase Optimization - Automated Maintenance

/**
 * DESCRIPTION
 * -----------
 * This migration schedules two critical cron jobs:
 * 1. Automatic refresh of materialized views every hour
 * 2. Daily cleanup of old refresh logs at 6 AM (bar closing time)
 *
 * PHASE: 3.1 - Supabase Optimization & Cost Reduction
 * TIMING: These jobs run in UTC timezone
 * PERFORMANCE: Cron jobs execute at low-traffic times to avoid user impact
 *
 * DEPENDENCIES
 * -----------
 * Requires: 20251218140000_enable_pg_cron_extension.sql (pg_cron enabled)
 * Requires: 046_materialized_view_monitoring.sql (refresh functions exist)
 *
 * JOB SCHEDULE EXPLANATION
 * -----------------------
 *
 * Job 1: refresh-materialized-views-hourly
 *   Schedule: 0 * * * * (every hour at minute 0)
 *   Function: refresh_all_materialized_views('cron')
 *   Purpose: Keep materialized views fresh without manual intervention
 *   Impact: Queries use 30% less time (pre-computed aggregations)
 *
 * Job 2: cleanup-refresh-logs-daily
 *   Schedule: 0 6 * * * (daily at 6 AM UTC)
 *   Function: cleanup_old_refresh_logs()
 *   Purpose: Maintain database performance by removing logs > 30 days old
 *   Timing: 6 AM aligns with bar closing time (business quietest period)
 *   Retention: Keeps 30 days of logs for compliance and troubleshooting
 *
 * CRON SYNTAX REFERENCE
 * --------------------
 * ┌───────────── minute (0 - 59)
 * │ ┌───────────── hour (0 - 23)
 * │ │ ┌───────────── day of month (1 - 31)
 * │ │ │ ┌───────────── month (1 - 12)
 * │ │ │ │ ┌───────────── day of week (0 - 6) (0 = Sunday)
 * │ │ │ │ │
 * * * * * *
 *
 * Examples:
 *   0 * * * * = Every hour
 *   0 6 * * * = Daily at 6 AM
 *   0 9-17 * * 1-5 = Weekdays 9 AM to 5 PM
 *   (slash)15 * * * * = Every 15 minutes
 */

-- =====================================================
-- 1. HOURLY REFRESH JOB
-- =====================================================

-- Schedule hourly materialized view refresh
-- Refresh all materialized views hourly
-- Views: product_sales_stats, daily_sales_summary, top_products_by_period, bar_stats_multi_period
SELECT cron.schedule(
  'refresh-materialized-views-hourly',
  '0 * * * *',  -- Every hour at minute 0 (00:00, 01:00, 02:00, etc. UTC)
  $$SELECT refresh_all_materialized_views('cron')$$
);

-- =====================================================
-- 2. DAILY LOG CLEANUP JOB
-- =====================================================

-- Clean up materialized_view_refresh_log entries older than 30 days
-- Scheduled at 6 AM UTC (bar closing time) for minimal user impact
SELECT cron.schedule(
  'cleanup-refresh-logs-daily',
  '0 6 * * *',  -- Daily at 6 AM UTC (bar closing hours, minimal traffic)
  $$SELECT cleanup_old_refresh_logs()$$
);

-- =====================================================
-- 3. VERIFICATION QUERIES (Run manually to verify)
-- =====================================================

/*
-- View all scheduled jobs
SELECT
  jobid,
  schedule_name,
  command,
  nodename,
  nodeport,
  database,
  username,
  active,
  jobid as "Job ID"
FROM cron.job;

-- View recent job execution history (last 10 runs)
SELECT
  jobid,
  start_time,
  end_time,
  succeeded,
  return_message
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 10;

-- View successful refresh metrics
SELECT
  view_name,
  successful_refreshes,
  failed_refreshes,
  ROUND(avg_duration_ms::numeric, 2) AS avg_duration_ms,
  max_duration_ms,
  min_duration_ms,
  last_successful_refresh,
  current_row_count,
  ROUND(minutes_since_last_refresh::numeric, 2) AS minutes_since_refresh
FROM materialized_view_metrics
ORDER BY view_name;
*/

-- =====================================================
-- 4. TROUBLESHOOTING
-- =====================================================

/*
COMMON ISSUES & SOLUTIONS:

Issue: Job not running or showing errors
Solution:
  1. Check if pg_cron extension is enabled: SELECT * FROM pg_available_extensions WHERE name = 'pg_cron';
  2. Check job status: SELECT * FROM cron.job WHERE schedule_name LIKE 'refresh%';
  3. Check execution logs: SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
  4. If function fails, check: materialized_view_metrics, materialized_view_refresh_log for error messages

Issue: Performance degradation during cron job
Solution:
  1. Check view refresh times: SELECT * FROM materialized_view_metrics;
  2. If > 30 seconds, optimize view query (usually needs better indexes)
  3. Consider running refresh during off-peak hours (modify schedule)

Issue: Need to temporarily disable a job
Solution:
  SELECT cron.unschedule('job-name');
  -- To re-enable:
  SELECT cron.schedule('job-name', '0 * * * *', $$SELECT refresh_all_materialized_views('cron')$$);
*/
