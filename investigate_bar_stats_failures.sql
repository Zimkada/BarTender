-- Investigation des 23 échecs de bar_stats_multi_period
-- Exécuter dans Supabase SQL Editor

-- 1. Voir les erreurs détaillées des échecs
SELECT
  id,
  view_name,
  refresh_started_at,
  refresh_completed_at,
  duration_ms,
  status,
  error_message,
  triggered_by
FROM materialized_view_refresh_log
WHERE view_name = 'bar_stats_multi_period'
  AND status = 'failed'
ORDER BY refresh_started_at DESC
LIMIT 10;

-- 2. Comparer avec les refresh réussis
SELECT
  status,
  COUNT(*) as count,
  AVG(duration_ms) as avg_duration,
  MIN(refresh_started_at) as first_attempt,
  MAX(refresh_started_at) as last_attempt
FROM materialized_view_refresh_log
WHERE view_name = 'bar_stats_multi_period'
GROUP BY status;

-- 3. Vérifier la vue bar_stats_multi_period_mat existe
SELECT
  schemaname,
  matviewname,
  hasindexes,
  ispopulated,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||matviewname)) as size
FROM pg_matviews
WHERE matviewname = 'bar_stats_multi_period_mat';

-- 4. Tester un refresh manuel pour voir l'erreur
SELECT refresh_materialized_view_with_logging('bar_stats_multi_period', 'manual_test');

-- 5. Vérifier les dépendances (daily_sales_summary_mat doit exister)
SELECT COUNT(*) as row_count FROM daily_sales_summary_mat;

-- 6. Timeline des échecs vs succès
SELECT
  DATE_TRUNC('hour', refresh_started_at) as hour,
  COUNT(*) FILTER (WHERE status = 'completed') as success_count,
  COUNT(*) FILTER (WHERE status = 'failed') as failure_count,
  STRING_AGG(DISTINCT error_message, ' | ') FILTER (WHERE status = 'failed') as errors
FROM materialized_view_refresh_log
WHERE view_name = 'bar_stats_multi_period'
  AND refresh_started_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE_TRUNC('hour', refresh_started_at)
ORDER BY hour DESC
LIMIT 20;
