-- Migration: Fix safe_refresh_materialized_view to use correct column names
-- Description: Update function to use refresh_started_at, refresh_completed_at, row_count instead of started_at, completed_at, rows_affected
-- Date: 2025-12-27

-- =====================================================
-- FIX: UPDATE FUNCTION TO USE ACTUAL COLUMN NAMES
-- =====================================================

DROP FUNCTION IF EXISTS safe_refresh_materialized_view(TEXT, BOOLEAN, INTEGER);

CREATE OR REPLACE FUNCTION safe_refresh_materialized_view(
  p_view_name TEXT,
  p_concurrently BOOLEAN DEFAULT TRUE,
  p_timeout_seconds INTEGER DEFAULT 30
)
RETURNS TABLE(
  success BOOLEAN,
  duration_ms INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_log_id UUID;
  v_start_time TIMESTAMPTZ;
  v_duration_ms INTEGER;
  v_sql TEXT;
BEGIN
  -- Start timing
  v_start_time := clock_timestamp();

  -- Log refresh start (use correct column names)
  INSERT INTO materialized_view_refresh_log (
    view_name,
    status,
    refresh_started_at,
    created_at
  )
  VALUES (
    p_view_name,
    'running',
    NOW(),
    NOW()
  )
  RETURNING id INTO v_log_id;

  -- Configure timeouts
  EXECUTE format('SET LOCAL statement_timeout = ''%s s''', p_timeout_seconds);
  EXECUTE format('SET LOCAL lock_timeout = ''%s s''', GREATEST(p_timeout_seconds - 5, 1));

  -- Build refresh SQL
  IF p_concurrently THEN
    v_sql := format('REFRESH MATERIALIZED VIEW CONCURRENTLY %I', p_view_name);
  ELSE
    v_sql := format('REFRESH MATERIALIZED VIEW %I', p_view_name);
  END IF;

  -- Execute refresh
  BEGIN
    EXECUTE v_sql;
    v_duration_ms := EXTRACT(MILLISECONDS FROM clock_timestamp() - v_start_time)::INTEGER;

    -- Update log with success (use correct column names)
    UPDATE materialized_view_refresh_log
    SET
      refresh_completed_at = NOW(),
      duration_ms = v_duration_ms,
      status = 'success'
    WHERE id = v_log_id;

    RETURN QUERY SELECT TRUE, v_duration_ms, NULL::TEXT;

  EXCEPTION
    WHEN lock_not_available THEN
      -- Timeout handling
      v_duration_ms := EXTRACT(MILLISECONDS FROM clock_timestamp() - v_start_time)::INTEGER;

      UPDATE materialized_view_refresh_log
      SET
        refresh_completed_at = NOW(),
        duration_ms = v_duration_ms,
        status = 'timeout',
        error_message = format('Timeout after %s seconds (lock not available)', p_timeout_seconds)
      WHERE id = v_log_id;

      RETURN QUERY SELECT FALSE, v_duration_ms, format('Timeout: lock not available after %s seconds', p_timeout_seconds)::TEXT;

    WHEN query_canceled THEN
      -- Statement timeout
      v_duration_ms := EXTRACT(MILLISECONDS FROM clock_timestamp() - v_start_time)::INTEGER;

      UPDATE materialized_view_refresh_log
      SET
        refresh_completed_at = NOW(),
        duration_ms = v_duration_ms,
        status = 'timeout',
        error_message = format('Query canceled after %s seconds', p_timeout_seconds)
      WHERE id = v_log_id;

      RETURN QUERY SELECT FALSE, v_duration_ms, format('Timeout: query canceled after %s seconds', p_timeout_seconds)::TEXT;

    WHEN OTHERS THEN
      -- General error handling
      v_duration_ms := EXTRACT(MILLISECONDS FROM clock_timestamp() - v_start_time)::INTEGER;

      UPDATE materialized_view_refresh_log
      SET
        refresh_completed_at = NOW(),
        duration_ms = v_duration_ms,
        status = 'failed',
        error_message = SQLERRM
      WHERE id = v_log_id;

      RETURN QUERY SELECT FALSE, v_duration_ms, SQLERRM::TEXT;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Permissions
GRANT EXECUTE ON FUNCTION safe_refresh_materialized_view TO authenticated;

-- Commentaire
COMMENT ON FUNCTION safe_refresh_materialized_view IS 'Refresh sécurisé avec timeout, logging et gestion erreurs - Colonnes: refresh_started_at, refresh_completed_at';

-- =====================================================
-- UPDATE VIEW: materialized_view_refresh_stats
-- =====================================================
-- Note: The view is already correct since it only uses view_name, status, duration_ms, created_at
-- These columns exist in the actual table schema

-- =====================================================
-- UPDATE VIEW: active_refresh_alerts (if it references the renamed columns)
-- =====================================================
-- Check if active_refresh_alerts view exists and needs updating
DO $$
BEGIN
  -- Drop and recreate active_refresh_alerts view if it exists
  DROP VIEW IF EXISTS active_refresh_alerts CASCADE;

  CREATE VIEW active_refresh_alerts AS
  SELECT
    a.id,
    a.view_name,
    a.consecutive_failures,
    a.first_failure_at,
    a.last_failure_at,
    a.alert_sent_at,
    a.resolved_at,
    a.status,
    a.error_messages,
    a.created_at,
    EXTRACT(EPOCH FROM (NOW() - a.first_failure_at))::INTEGER AS incident_duration_seconds,
    s.total_refreshes,
    s.success_count,
    s.failed_count,
    s.timeout_count,
    s.avg_duration_ms
  FROM refresh_failure_alerts a
  LEFT JOIN materialized_view_refresh_stats s ON s.view_name = a.view_name
  WHERE a.status = 'active'
  ORDER BY a.consecutive_failures DESC, a.first_failure_at ASC;

  -- Grant access
  GRANT SELECT ON active_refresh_alerts TO authenticated;

  -- Add comment
  COMMENT ON VIEW active_refresh_alerts IS 'Alertes actives avec stats enrichies (compatible avec colonnes refresh_started_at/refresh_completed_at)';
END $$;
