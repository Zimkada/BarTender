-- 046_materialized_view_monitoring.sql
-- Monitoring et optimisations pour les vues matérialisées
-- Implémente les recommandations : logging, metrics, et refresh automatique

-- =====================================================
-- 1. TABLE DE MONITORING DES REFRESH
-- =====================================================

CREATE TABLE IF NOT EXISTS materialized_view_refresh_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  view_name TEXT NOT NULL,
  refresh_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  refresh_completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  row_count INTEGER,
  status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
  error_message TEXT,
  triggered_by TEXT, -- 'manual', 'trigger', 'cron', 'app_startup'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_log_view ON materialized_view_refresh_log(view_name);
CREATE INDEX idx_refresh_log_started ON materialized_view_refresh_log(refresh_started_at DESC);
CREATE INDEX idx_refresh_log_status ON materialized_view_refresh_log(status);

COMMENT ON TABLE materialized_view_refresh_log IS 'Historique des rafraîchissements des vues matérialisées';

-- =====================================================
-- 2. FONCTION DE REFRESH AVEC LOGGING
-- =====================================================

CREATE OR REPLACE FUNCTION refresh_materialized_view_with_logging(
  p_view_name TEXT,
  p_triggered_by TEXT DEFAULT 'manual'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_log_id UUID;
  v_start_time TIMESTAMPTZ;
  v_end_time TIMESTAMPTZ;
  v_duration_ms INTEGER;
  v_row_count INTEGER;
  v_sql TEXT;
BEGIN
  -- Créer l'entrée de log
  INSERT INTO materialized_view_refresh_log (view_name, status, triggered_by)
  VALUES (p_view_name, 'started', p_triggered_by)
  RETURNING id INTO v_log_id;

  v_start_time := clock_timestamp();

  -- Exécuter le refresh
  BEGIN
    v_sql := format('REFRESH MATERIALIZED VIEW CONCURRENTLY %I', p_view_name || '_mat');
    EXECUTE v_sql;
    
    v_end_time := clock_timestamp();
    v_duration_ms := EXTRACT(EPOCH FROM (v_end_time - v_start_time)) * 1000;

    -- Compter les lignes
    v_sql := format('SELECT COUNT(*) FROM %I', p_view_name || '_mat');
    EXECUTE v_sql INTO v_row_count;

    -- Mettre à jour le log avec succès
    UPDATE materialized_view_refresh_log
    SET 
      refresh_completed_at = v_end_time,
      duration_ms = v_duration_ms,
      row_count = v_row_count,
      status = 'completed'
    WHERE id = v_log_id;

    RAISE NOTICE '[%] Refresh completed in % ms (% rows)', p_view_name, v_duration_ms, v_row_count;

  EXCEPTION WHEN OTHERS THEN
    -- Logger l'erreur
    UPDATE materialized_view_refresh_log
    SET 
      refresh_completed_at = clock_timestamp(),
      status = 'failed',
      error_message = SQLERRM
    WHERE id = v_log_id;

    RAISE WARNING '[%] Refresh failed: %', p_view_name, SQLERRM;
  END;

  RETURN v_log_id;
END;
$$;

-- =====================================================
-- 3. FONCTION DE REFRESH GLOBAL (CACHE WARMING)
-- =====================================================

CREATE OR REPLACE FUNCTION refresh_all_materialized_views(
  p_triggered_by TEXT DEFAULT 'manual'
)
RETURNS TABLE(view_name TEXT, log_id UUID, status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_view RECORD;
  v_log_id UUID;
BEGIN
  -- Liste des vues à rafraîchir dans l'ordre de dépendance
  FOR v_view IN 
    SELECT unnest(ARRAY[
      'product_sales_stats',
      'daily_sales_summary',
      'top_products_by_period',
      'bar_stats_multi_period'
    ]) AS name
  LOOP
    BEGIN
      v_log_id := refresh_materialized_view_with_logging(v_view.name, p_triggered_by);
      
      RETURN QUERY SELECT 
        v_view.name,
        v_log_id,
        'completed'::TEXT;
        
    EXCEPTION WHEN OTHERS THEN
      RETURN QUERY SELECT 
        v_view.name,
        NULL::UUID,
        'failed'::TEXT;
    END;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION refresh_all_materialized_views IS 'Rafraîchit toutes les vues matérialisées avec logging';

-- =====================================================
-- 4. VUE POUR MONITORING DES PERFORMANCES
-- =====================================================

CREATE OR REPLACE VIEW materialized_view_metrics AS
SELECT 
  view_name,
  COUNT(*) FILTER (WHERE status = 'completed') AS successful_refreshes,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed_refreshes,
  AVG(duration_ms) FILTER (WHERE status = 'completed') AS avg_duration_ms,
  MAX(duration_ms) FILTER (WHERE status = 'completed') AS max_duration_ms,
  MIN(duration_ms) FILTER (WHERE status = 'completed') AS min_duration_ms,
  MAX(refresh_completed_at) FILTER (WHERE status = 'completed') AS last_successful_refresh,
  MAX(row_count) FILTER (WHERE status = 'completed') AS current_row_count,
  -- Fraîcheur des données (temps depuis dernier refresh)
  EXTRACT(EPOCH FROM (NOW() - MAX(refresh_completed_at) FILTER (WHERE status = 'completed'))) / 60 AS minutes_since_last_refresh
FROM materialized_view_refresh_log
WHERE refresh_started_at >= NOW() - INTERVAL '7 days'
GROUP BY view_name;

COMMENT ON VIEW materialized_view_metrics IS 'Métriques de performance des vues matérialisées';

-- =====================================================
-- 5. FONCTION POUR VÉRIFIER LA FRAÎCHEUR
-- =====================================================

CREATE OR REPLACE FUNCTION get_view_freshness(p_view_name TEXT)
RETURNS TABLE(
  view_name TEXT,
  last_refresh TIMESTAMPTZ,
  minutes_old NUMERIC,
  is_stale BOOLEAN
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p_view_name,
    MAX(refresh_completed_at) FILTER (WHERE status = 'completed'),
    EXTRACT(EPOCH FROM (NOW() - MAX(refresh_completed_at) FILTER (WHERE status = 'completed'))) / 60,
    EXTRACT(EPOCH FROM (NOW() - MAX(refresh_completed_at) FILTER (WHERE status = 'completed'))) / 60 > 60 -- Stale si > 1h
  FROM materialized_view_refresh_log
  WHERE view_name = p_view_name;
END;
$$;

-- =====================================================
-- 6. MISE À JOUR DES FONCTIONS EXISTANTES
-- =====================================================

-- Mettre à jour les fonctions de refresh pour utiliser le logging
CREATE OR REPLACE FUNCTION refresh_product_sales_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM refresh_materialized_view_with_logging('product_sales_stats', 'trigger');
END;
$$;

CREATE OR REPLACE FUNCTION refresh_daily_sales_summary()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM refresh_materialized_view_with_logging('daily_sales_summary', 'trigger');
END;
$$;

-- =====================================================
-- 7. NETTOYAGE AUTOMATIQUE DES LOGS ANCIENS
-- =====================================================

CREATE OR REPLACE FUNCTION cleanup_old_refresh_logs()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  -- Garder seulement les 30 derniers jours de logs
  DELETE FROM materialized_view_refresh_log
  WHERE refresh_started_at < NOW() - INTERVAL '30 days';
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  RAISE NOTICE 'Cleaned up % old refresh log entries', v_deleted_count;
  
  RETURN v_deleted_count;
END;
$$;

-- =====================================================
-- 8. PERMISSIONS
-- =====================================================

-- Lecture des métriques pour authenticated users
GRANT SELECT ON materialized_view_metrics TO authenticated;
GRANT SELECT ON materialized_view_refresh_log TO authenticated;

-- Exécution des fonctions de refresh (pour les gérants/promoteurs)
GRANT EXECUTE ON FUNCTION refresh_all_materialized_views TO authenticated;
GRANT EXECUTE ON FUNCTION get_view_freshness TO authenticated;

-- =====================================================
-- 9. INSTRUCTIONS POUR PG_CRON (À CONFIGURER MANUELLEMENT)
-- =====================================================

-- Note: pg_cron doit être activé dans Supabase Dashboard
-- Ensuite, exécuter ces commandes via SQL Editor:

/*
-- Refresh automatique toutes les heures
SELECT cron.schedule(
  'refresh-materialized-views-hourly',
  '0 * * * *', -- Toutes les heures à minute 0
  $$SELECT refresh_all_materialized_views('cron')$$
);

-- Nettoyage des logs tous les jours à 3h du matin
SELECT cron.schedule(
  'cleanup-refresh-logs-daily',
  '0 3 * * *',
  $$SELECT cleanup_old_refresh_logs()$$
);

-- Vérifier les jobs cron
SELECT * FROM cron.job;

-- Voir l'historique d'exécution
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
*/

COMMENT ON FUNCTION refresh_all_materialized_views IS 'À utiliser avec pg_cron pour refresh automatique';

-- =====================================================
-- 10. INITIAL CACHE WARMING
-- =====================================================

-- Rafraîchir toutes les vues au démarrage
SELECT refresh_all_materialized_views('initial_setup');

-- Afficher les métriques
SELECT * FROM materialized_view_metrics;
