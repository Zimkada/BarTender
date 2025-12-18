-- 20251218140000_enable_pg_cron_extension.sql
-- Enable pg_cron PostgreSQL extension for scheduled jobs
-- Phase 3.1: Supabase Optimization - Automated View Refreshes

/**
 * DESCRIPTION
 * -----------
 * This migration enables the pg_cron extension which allows scheduling PostgreSQL
 * functions to run automatically at specified intervals using cron syntax.
 *
 * PHASE: 3.1 - Supabase Optimization & Cost Reduction
 * TARGET: Automate materialized view refreshes (currently manual)
 * BENEFIT: Reduces -30% database queries, improves data freshness
 *
 * DEPENDENCIES
 * -----------
 * Requires: 046_materialized_view_monitoring.sql (refresh functions must exist)
 * Must run before: 20251218140001_schedule_pg_cron_jobs.sql
 *
 * NOTES
 * -----
 * pg_cron is available on all Supabase tiers (free, pro, enterprise)
 * No configuration needed - extension is pre-installed on Supabase infrastructure
 */

-- Enable the pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Verify extension is enabled
-- SELECT * FROM pg_extension WHERE extname = 'pg_cron';

COMMENT ON EXTENSION pg_cron IS 'Job scheduler for periodic task execution using cron syntax';
