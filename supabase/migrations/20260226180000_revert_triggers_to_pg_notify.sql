-- Migration: Revert triggers to pg_notify (safe)
-- Reverts: 20260226130000_fix_triggers_for_free_tier.sql
--
-- Why:
--   REFRESH MATERIALIZED VIEW CONCURRENTLY cannot run inside a transaction block.
--   Triggers execute inside the transaction of the triggering statement (INSERT/UPDATE/DELETE).
--   Calling refresh functions directly from triggers causes:
--     ERROR: REFRESH MATERIALIZED VIEW CONCURRENTLY cannot run inside a transaction block
--   This would rollback the entire write (sale, expense, supply, salary) → data loss.
--
--   pg_notify() is non-transactional and safe from triggers. Without pg_cron,
--   the signal goes unheard — but writes are never broken.
--
-- Free tier refresh strategy (without pg_cron):
--   1. App startup cache warming (useCacheWarming hook)
--   2. Manual refresh button (AccountingOverview)
--   3. React Query cache: staleTime avoids unnecessary refetches

CREATE OR REPLACE FUNCTION trigger_refresh_daily_summary()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_last_refresh TIMESTAMPTZ;
  v_view_name TEXT := 'daily_sales_summary';
BEGIN
  SELECT MAX(refresh_completed_at) INTO v_last_refresh
  FROM materialized_view_refresh_log
  WHERE view_name = v_view_name AND status = 'completed';

  IF v_last_refresh IS NULL OR v_last_refresh < NOW() - INTERVAL '10 minutes' THEN
    PERFORM pg_notify('refresh_stats', v_view_name || '_mat');
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION trigger_refresh_product_stats()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_last_refresh TIMESTAMPTZ;
  v_view_name TEXT := 'product_sales_stats';
BEGIN
  SELECT MAX(refresh_completed_at) INTO v_last_refresh
  FROM materialized_view_refresh_log
  WHERE view_name = v_view_name AND status = 'completed';

  IF v_last_refresh IS NULL OR v_last_refresh < NOW() - INTERVAL '10 minutes' THEN
    PERFORM pg_notify('refresh_stats', v_view_name || '_mat');
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION trigger_refresh_expenses_summary()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_last_refresh TIMESTAMPTZ;
  v_view_name TEXT := 'expenses_summary';
BEGIN
  SELECT MAX(refresh_completed_at) INTO v_last_refresh
  FROM materialized_view_refresh_log
  WHERE view_name = v_view_name AND status = 'completed';

  IF v_last_refresh IS NULL OR v_last_refresh < NOW() - INTERVAL '15 minutes' THEN
    PERFORM pg_notify('refresh_stats', v_view_name || '_mat');
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION trigger_refresh_salaries_summary()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_last_refresh TIMESTAMPTZ;
  v_view_name TEXT := 'salaries_summary';
BEGIN
  SELECT MAX(refresh_completed_at) INTO v_last_refresh
  FROM materialized_view_refresh_log
  WHERE view_name = v_view_name AND status = 'completed';

  IF v_last_refresh IS NULL OR v_last_refresh < NOW() - INTERVAL '30 minutes' THEN
    PERFORM pg_notify('refresh_stats', v_view_name || '_mat');
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION trigger_refresh_daily_summary    IS 'pg_notify debounced 10 min — safe in trigger (non-transactional)';
COMMENT ON FUNCTION trigger_refresh_product_stats    IS 'pg_notify debounced 10 min — safe in trigger (non-transactional)';
COMMENT ON FUNCTION trigger_refresh_expenses_summary IS 'pg_notify debounced 15 min — safe in trigger (non-transactional)';
COMMENT ON FUNCTION trigger_refresh_salaries_summary IS 'pg_notify debounced 30 min — safe in trigger (non-transactional)';
