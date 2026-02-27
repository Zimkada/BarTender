-- Migration: Fix refresh infrastructure (cascade de bugs)
-- Date: 2026-02-27
--
-- Bugs corrigés (en cascade) :
--
-- BUG 1 — Status constraint mismatch (BLOQUANT)
--   Migration 046 crée la table avec CHECK ('started','completed','failed')
--   Migration 20251227221000 change la contrainte en ('running','success','failed','timeout')
--   refresh_materialized_view_with_logging INSERT encore 'started' → violation → EXCEPTION →
--   le REFRESH ne s'exécute jamais → log toujours vide → useCacheWarming inopérant.
--   Fix : 'started' → 'running', 'completed' → 'success'
--
-- BUG 2 — REFRESH MATERIALIZED VIEW CONCURRENTLY dans PL/pgSQL (BLOQUANT)
--   CONCURRENTLY ne peut pas s'exécuter dans un contexte transactionnel (fonction PL/pgSQL).
--   Aurait échoué même si BUG 1 était corrigé.
--   Fix : retirer CONCURRENTLY (lock de lecture bref, acceptable sur free tier)
--
-- BUG 3 — Vues et fonctions de monitoring obsolètes
--   materialized_view_metrics, get_view_freshness, debouncing_metrics cherchent status='completed'
--   → retournent toujours NULL/0 depuis la migration 20251227221000.
--   Fix : aligner sur 'success'
--
-- BUG 4 — Fonctions trigger debounce
--   Les 4 fonctions trigger cherchent status='completed' → v_last_refresh toujours NULL →
--   pg_notify émis à chaque write (debounce inopérant).
--   Fix : aligner sur 'success'
--
-- BUG 5 — refresh_expenses_summary avec CONCURRENTLY direct
--   Migration 20260225000100 définit refresh_expenses_summary() avec REFRESH ... CONCURRENTLY
--   → échoue via RPC (contexte transactionnel). Déléguer au logger.
--   Fix : déléguer à refresh_materialized_view_with_logging
--
-- BUG 6 — 'bar_ancillary_stats_mat' dans refresh_all_materialized_views
--   La fonction appende _mat → tente REFRESH bar_ancillary_stats_mat_mat (inexistant).
--   Fix : 'bar_ancillary_stats_mat' → 'bar_ancillary_stats'
--
-- BUG 7 — 'salaries_summary' dans refresh_all_materialized_views
--   salaries_summary_mat est une VIEW normale (relkind='v'), pas une mat view.
--   REFRESH MATERIALIZED VIEW salaries_summary_mat échoue → log pollué.
--   Fix : retirer 'salaries_summary' de la liste (vue toujours fraîche, pas de refresh nécessaire)

-- =====================================================
-- FIX 1 + 2 : refresh_materialized_view_with_logging
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
  v_view_name_mat TEXT;
BEGIN
  -- Guard 1 : rejeter les valeurs nulles/vides
  IF p_view_name IS NULL OR trim(p_view_name) = '' THEN
    RAISE EXCEPTION
      'refresh_materialized_view_with_logging: p_view_name ne peut pas être null ou vide';
  END IF;

  -- Guard 2 : rejeter les noms déjà suffixés en _mat pour éviter le double _mat_mat
  IF right(p_view_name, 4) = '_mat' THEN
    RAISE EXCEPTION
      'refresh_materialized_view_with_logging: passer le nom de base sans suffixe _mat (reçu: %)',
      p_view_name;
  END IF;

  v_view_name_mat := p_view_name || '_mat';

  -- 'running' : aligné avec CHECK ('running','success','failed','timeout') de 20251227221000
  INSERT INTO materialized_view_refresh_log (view_name, status, triggered_by)
  VALUES (p_view_name, 'running', p_triggered_by)
  RETURNING id INTO v_log_id;

  v_start_time := clock_timestamp();

  BEGIN
    -- Sans CONCURRENTLY : compatible avec contexte transactionnel PL/pgSQL.
    -- Lock de lecture ponctuel acceptable (free tier, refresh rare, dataset petit).
    -- Avec pg_cron (plan Pro), CONCURRENTLY pourra être réintroduit si nécessaire.
    EXECUTE format('REFRESH MATERIALIZED VIEW %I', v_view_name_mat);

    v_end_time := clock_timestamp();
    v_duration_ms := EXTRACT(EPOCH FROM (v_end_time - v_start_time)) * 1000;
    EXECUTE format('SELECT COUNT(*) FROM %I', v_view_name_mat) INTO v_row_count;

    -- 'success' : aligné avec la contrainte
    UPDATE materialized_view_refresh_log
    SET
      refresh_completed_at = v_end_time,
      duration_ms          = v_duration_ms,
      row_count            = v_row_count,
      status               = 'success'
    WHERE id = v_log_id;

    RAISE NOTICE '[%] Refresh completed in % ms (% rows)', p_view_name, v_duration_ms, v_row_count;

  EXCEPTION WHEN OTHERS THEN
    UPDATE materialized_view_refresh_log
    SET
      refresh_completed_at = clock_timestamp(),
      status               = 'failed',
      error_message        = SQLERRM
    WHERE id = v_log_id;

    RAISE WARNING '[%] Refresh failed: %', p_view_name, SQLERRM;
  END;

  RETURN v_log_id;
END;
$$;

COMMENT ON FUNCTION refresh_materialized_view_with_logging IS
  'Refresh mat view avec logging. Status: running→success/failed (aligne 20251227221000). '
  'Sans CONCURRENTLY : compatible PL/pgSQL. À upgrader vers CONCURRENTLY avec pg_cron (Pro).';

-- =====================================================
-- FIX 6 + 7 : refresh_all_materialized_views
-- =====================================================

CREATE OR REPLACE FUNCTION refresh_all_materialized_views(
  p_triggered_by TEXT DEFAULT 'manual'
)
RETURNS TABLE(view_name TEXT, log_id UUID, status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_view         RECORD;
  v_log_id       UUID;
  v_actual_status TEXT;
BEGIN
  FOR v_view IN
    SELECT unnest(ARRAY[
      'product_sales_stats',
      'daily_sales_summary',
      'expenses_summary',
      -- 'salaries_summary' retiré : salaries_summary_mat est une VIEW normale (relkind='v'),
      --   pas une materialized view. Toujours fraîche, REFRESH inutile et erroné.
      'top_products_by_period',
      'bar_stats_multi_period',
      'bar_ancillary_stats'   -- Corrigé : était 'bar_ancillary_stats_mat' → double _mat bug
    ]) AS name
  LOOP
    BEGIN
      v_log_id := refresh_materialized_view_with_logging(v_view.name, p_triggered_by);

      -- Lire le statut réel depuis le log : refresh_materialized_view_with_logging capture
      -- les erreurs en interne (WHEN OTHERS) et ne relance pas. Sans ce SELECT, on retournerait
      -- 'success' même en cas d'échec interne → faux positif de monitoring.
      SELECT status INTO v_actual_status
      FROM materialized_view_refresh_log
      WHERE id = v_log_id;

      RETURN QUERY SELECT v_view.name, v_log_id, COALESCE(v_actual_status, 'failed')::TEXT;

    EXCEPTION WHEN OTHERS THEN
      RETURN QUERY SELECT v_view.name, NULL::UUID, 'failed'::TEXT;
    END;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION refresh_all_materialized_views IS
  'Refresh toutes les mat views avec logging. '
  'salaries_summary exclu (vue normale). bar_ancillary_stats corrigé (était double _mat).';

-- =====================================================
-- FIX 3a : materialized_view_metrics
-- =====================================================

CREATE OR REPLACE VIEW materialized_view_metrics AS
SELECT
  view_name,
  COUNT(*) FILTER (WHERE status = 'success')                                              AS successful_refreshes,
  COUNT(*) FILTER (WHERE status = 'failed')                                               AS failed_refreshes,
  AVG(duration_ms)            FILTER (WHERE status = 'success')                           AS avg_duration_ms,
  MAX(duration_ms)            FILTER (WHERE status = 'success')                           AS max_duration_ms,
  MIN(duration_ms)            FILTER (WHERE status = 'success')                           AS min_duration_ms,
  MAX(refresh_completed_at)   FILTER (WHERE status = 'success')                           AS last_successful_refresh,
  MAX(row_count)              FILTER (WHERE status = 'success')                           AS current_row_count,
  EXTRACT(EPOCH FROM (NOW() - MAX(refresh_completed_at) FILTER (WHERE status = 'success'))) / 60
                                                                                          AS minutes_since_last_refresh
FROM materialized_view_refresh_log
WHERE refresh_started_at >= NOW() - INTERVAL '7 days'
GROUP BY view_name;

COMMENT ON VIEW materialized_view_metrics IS
  'Métriques refresh mat views. Aligné sur status=success (depuis 20251227221000).';

-- =====================================================
-- FIX 3b : get_view_freshness
-- =====================================================

CREATE OR REPLACE FUNCTION get_view_freshness(p_view_name TEXT)
RETURNS TABLE(
  view_name   TEXT,
  last_refresh TIMESTAMPTZ,
  minutes_old  NUMERIC,
  is_stale     BOOLEAN
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p_view_name,
    MAX(log.refresh_completed_at) FILTER (WHERE log.status = 'success'),
    EXTRACT(EPOCH FROM (NOW() - MAX(log.refresh_completed_at) FILTER (WHERE log.status = 'success'))) / 60,
    EXTRACT(EPOCH FROM (NOW() - MAX(log.refresh_completed_at) FILTER (WHERE log.status = 'success'))) / 60 > 60
  FROM materialized_view_refresh_log log
  WHERE log.view_name = p_view_name;
END;
$$;

-- =====================================================
-- FIX 3c : debouncing_metrics
-- =====================================================

CREATE OR REPLACE VIEW debouncing_metrics AS
SELECT
  view_name,
  COUNT(*) FILTER (WHERE status = 'success')                 AS successful_refreshes,
  COUNT(*) FILTER (WHERE triggered_by = 'trigger')           AS trigger_refreshes,
  COUNT(*) FILTER (WHERE triggered_by = 'manual')            AS manual_refreshes,
  COUNT(*) FILTER (WHERE triggered_by = 'manual_force')      AS forced_refreshes,
  AVG(duration_ms)          FILTER (WHERE status = 'success') AS avg_duration_ms,
  MAX(refresh_completed_at) FILTER (WHERE status = 'success') AS last_refresh,
  CASE
    WHEN COUNT(*) FILTER (WHERE status = 'success') > 0
    THEN ROUND(
      (1 - (COUNT(*) FILTER (WHERE status = 'success')::NUMERIC /
            GREATEST(COUNT(*), 1))) * 100, 2)
    ELSE 0
  END AS estimated_debounce_rate_percent
FROM materialized_view_refresh_log
WHERE refresh_started_at >= NOW() - INTERVAL '7 days'
GROUP BY view_name
ORDER BY last_refresh DESC;

GRANT SELECT ON debouncing_metrics TO authenticated;

-- =====================================================
-- FIX 4 : Fonctions trigger debounce (status = 'success')
-- =====================================================

CREATE OR REPLACE FUNCTION trigger_refresh_daily_summary()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_last_refresh TIMESTAMPTZ;
  v_view_name TEXT := 'daily_sales_summary';
BEGIN
  SELECT MAX(refresh_completed_at) INTO v_last_refresh
  FROM materialized_view_refresh_log
  WHERE view_name = v_view_name AND status = 'success';

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
  WHERE view_name = v_view_name AND status = 'success';

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
  WHERE view_name = v_view_name AND status = 'success';

  IF v_last_refresh IS NULL OR v_last_refresh < NOW() - INTERVAL '15 minutes' THEN
    PERFORM pg_notify('refresh_stats', v_view_name || '_mat');
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION trigger_refresh_salaries_summary()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- NO-OP intentionnel : salaries_summary_mat est une VIEW normale (relkind='v'), pas matérialisée.
  -- Elle est toujours fraîche — aucun REFRESH nécessaire.
  -- pg_notify('refresh_stats', 'salaries_summary_mat') retiré : si un listener revient (plan Pro),
  -- il tenterait REFRESH MATERIALIZED VIEW sur une vue normale → erreur systématique.
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION trigger_refresh_daily_summary    IS 'pg_notify debounced 10 min — status=success (corrigé)';
COMMENT ON FUNCTION trigger_refresh_product_stats    IS 'pg_notify debounced 10 min — status=success (corrigé)';
COMMENT ON FUNCTION trigger_refresh_expenses_summary IS 'pg_notify debounced 15 min — status=success (corrigé)';
COMMENT ON FUNCTION trigger_refresh_salaries_summary IS 'NO-OP — salaries_summary_mat est une VIEW normale, toujours fraîche';

-- =====================================================
-- FIX 5 : refresh_expenses_summary (retire CONCURRENTLY direct)
-- =====================================================

-- DROP requis : passage de RETURNS void → RETURNS UUID (PostgreSQL interdit CREATE OR REPLACE
-- quand le type de retour change — ERROR: 42P13: cannot change return type of existing function)
DROP FUNCTION IF EXISTS refresh_expenses_summary();

CREATE OR REPLACE FUNCTION refresh_expenses_summary()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Retourne le log_id (UUID) au lieu de void pour permettre la vérification du statut côté app.
  -- Sans ce retour, AnalyticsService.refreshView ne peut pas distinguer succès/échec interne.
  RETURN refresh_materialized_view_with_logging('expenses_summary', 'manual');
END;
$$;

COMMENT ON FUNCTION refresh_expenses_summary IS
  'Délègue à refresh_materialized_view_with_logging, retourne UUID (log_id). '
  'Retour UUID requis : permet vérification status=failed dans le log côté app. '
  'Remplace la version 20260225000100 qui appelait CONCURRENTLY directement (incompatible RPC).';
