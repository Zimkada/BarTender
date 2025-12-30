-- Migration: Garde-fous pg_cron avec timeout + logging
-- Description: Protection contre échecs refresh materialized views
-- Compatibilité: Supabase Free + Pro
-- Date: 2025-12-27

-- =====================================================
-- 1. TABLE DE LOG DES REFRESH MATERIALIZED VIEWS
-- =====================================================

CREATE TABLE IF NOT EXISTS materialized_view_refresh_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  view_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed', 'timeout')),
  error_message TEXT,
  rows_affected INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes pour queries fréquentes
CREATE INDEX idx_mv_refresh_log_view ON materialized_view_refresh_log(view_name);
CREATE INDEX idx_mv_refresh_log_status ON materialized_view_refresh_log(status);
CREATE INDEX idx_mv_refresh_log_created ON materialized_view_refresh_log(created_at DESC);

-- RLS sur table de log (admin seulement)
ALTER TABLE materialized_view_refresh_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SuperAdmin can view refresh logs"
  ON materialized_view_refresh_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bar_members
      WHERE user_id = auth.uid()
        AND role = 'super_admin'
        AND is_active = true
    )
  );

-- =====================================================
-- 2. FONCTION SAFE REFRESH MATERIALIZED VIEW
-- =====================================================

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
  v_start_time := clock_timestamp();

  -- Créer log entry
  INSERT INTO materialized_view_refresh_log (view_name, status)
  VALUES (p_view_name, 'running')
  RETURNING id INTO v_log_id;

  -- Configurer timeouts
  EXECUTE format('SET LOCAL statement_timeout = ''%s s''', p_timeout_seconds);
  EXECUTE format('SET LOCAL lock_timeout = ''%s s''', p_timeout_seconds - 5);

  -- Construire SQL refresh
  IF p_concurrently THEN
    v_sql := format('REFRESH MATERIALIZED VIEW CONCURRENTLY %I', p_view_name);
  ELSE
    v_sql := format('REFRESH MATERIALIZED VIEW %I', p_view_name);
  END IF;

  -- Exécuter refresh
  BEGIN
    EXECUTE v_sql;

    -- Calculer durée
    v_duration_ms := EXTRACT(MILLISECONDS FROM clock_timestamp() - v_start_time)::INTEGER;

    -- Mettre à jour log: success
    UPDATE materialized_view_refresh_log
    SET
      completed_at = NOW(),
      duration_ms = v_duration_ms,
      status = 'success'
    WHERE id = v_log_id;

    -- Retourner succès
    RETURN QUERY SELECT TRUE, v_duration_ms, NULL::TEXT;

  EXCEPTION
    WHEN lock_not_available THEN
      v_duration_ms := EXTRACT(MILLISECONDS FROM clock_timestamp() - v_start_time)::INTEGER;

      UPDATE materialized_view_refresh_log
      SET
        completed_at = NOW(),
        duration_ms = v_duration_ms,
        status = 'timeout',
        error_message = 'Lock timeout: impossible d''acquérir le verrou'
      WHERE id = v_log_id;

      RETURN QUERY SELECT FALSE, v_duration_ms, 'Lock timeout'::TEXT;

    WHEN query_canceled THEN
      v_duration_ms := EXTRACT(MILLISECONDS FROM clock_timestamp() - v_start_time)::INTEGER;

      UPDATE materialized_view_refresh_log
      SET
        completed_at = NOW(),
        duration_ms = v_duration_ms,
        status = 'timeout',
        error_message = 'Statement timeout: requête annulée après ' || p_timeout_seconds || 's'
      WHERE id = v_log_id;

      RETURN QUERY SELECT FALSE, v_duration_ms, format('Statement timeout après %ss', p_timeout_seconds)::TEXT;

    WHEN OTHERS THEN
      v_duration_ms := EXTRACT(MILLISECONDS FROM clock_timestamp() - v_start_time)::INTEGER;

      UPDATE materialized_view_refresh_log
      SET
        completed_at = NOW(),
        duration_ms = v_duration_ms,
        status = 'failed',
        error_message = SQLERRM
      WHERE id = v_log_id;

      RETURN QUERY SELECT FALSE, v_duration_ms, SQLERRM::TEXT;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 3. FONCTION WRAPPER POUR bars_with_stats
-- =====================================================

CREATE OR REPLACE FUNCTION refresh_bars_with_stats()
RETURNS TABLE(
  success BOOLEAN,
  duration_ms INTEGER,
  error_message TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM safe_refresh_materialized_view('bars_with_stats', TRUE, 30);
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 4. VUE DASHBOARD REFRESH STATS
-- =====================================================

CREATE OR REPLACE VIEW materialized_view_refresh_stats AS
SELECT
  view_name,
  COUNT(*) AS total_refreshes,
  COUNT(*) FILTER (WHERE status = 'success') AS success_count,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed_count,
  COUNT(*) FILTER (WHERE status = 'timeout') AS timeout_count,
  ROUND(AVG(duration_ms)) AS avg_duration_ms,
  MAX(duration_ms) AS max_duration_ms,
  MIN(duration_ms) AS min_duration_ms,
  MAX(created_at) AS last_refresh_at
FROM materialized_view_refresh_log
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY view_name;

-- Permissions
GRANT SELECT ON materialized_view_refresh_stats TO authenticated;
GRANT EXECUTE ON FUNCTION safe_refresh_materialized_view TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_bars_with_stats TO authenticated;

-- =====================================================
-- 5. FONCTION CLEANUP LOGS ANCIENS
-- =====================================================

CREATE OR REPLACE FUNCTION cleanup_old_refresh_logs()
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  -- Garder seulement 30 jours de logs
  DELETE FROM materialized_view_refresh_log
  WHERE created_at < NOW() - INTERVAL '30 days';

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RAISE NOTICE 'Cleaned up % old refresh logs', v_deleted_count;

  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION cleanup_old_refresh_logs TO authenticated;

-- Commentaires
COMMENT ON TABLE materialized_view_refresh_log IS 'Historique des refresh materialized views avec timeouts et erreurs';
COMMENT ON FUNCTION safe_refresh_materialized_view IS 'Refresh sécurisé avec timeout + logging (30s par défaut)';
COMMENT ON FUNCTION refresh_bars_with_stats IS 'Wrapper pour refresh bars_with_stats avec monitoring';
COMMENT ON VIEW materialized_view_refresh_stats IS 'Stats agrégées des refresh par vue (7 derniers jours)';
