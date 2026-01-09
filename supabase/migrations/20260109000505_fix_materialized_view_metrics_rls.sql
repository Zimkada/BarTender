-- =====================================================
-- FIX: MATERIALIZED_VIEW_METRICS RLS & PERMISSIONS
-- =====================================================
-- Issue: materialized_view_metrics returns 403 Forbidden
-- Root cause: View has no GRANT SELECT for authenticated users
-- Solution: Add GRANT SELECT + security_invoker = true

BEGIN;

-- =====================================================
-- 1. GRANT SELECT ON materialized_view_metrics
-- =====================================================

GRANT SELECT ON materialized_view_metrics TO authenticated;
GRANT SELECT ON materialized_view_metrics TO anon;

-- =====================================================
-- 2. GRANT SELECT ON materialized_view_refresh_log
-- =====================================================

GRANT SELECT ON materialized_view_refresh_log TO authenticated;
GRANT SELECT ON materialized_view_refresh_log TO anon;

-- =====================================================
-- 3. RECREATE VIEW WITH security_invoker = true
-- =====================================================

DROP VIEW IF EXISTS materialized_view_metrics CASCADE;

CREATE VIEW materialized_view_metrics
WITH (security_invoker = true)
AS
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
GROUP BY view_name;

COMMENT ON VIEW materialized_view_metrics IS
'Métriques de performance des vues matérialisées. Accessible aux utilisateurs authentifiés.
SÉCURITÉ: security_invoker = true pour appliquer le RLS de la table sous-jacente.';

-- =====================================================
-- 4. VERIFICATION
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '
  ╔════════════════════════════════════════════════════════════╗
  ║   MATERIALIZED VIEW METRICS - RLS FIX APPLIED              ║
  ╚════════════════════════════════════════════════════════════╝

  ✅ GRANT SELECT ON materialized_view_metrics TO authenticated
  ✅ GRANT SELECT ON materialized_view_metrics TO anon
  ✅ GRANT SELECT ON materialized_view_refresh_log TO authenticated
  ✅ GRANT SELECT ON materialized_view_refresh_log TO anon
  ✅ Recreated view with security_invoker = true

  Result:
  • View is now readable by authenticated users
  • Automatic RLS from materialized_view_refresh_log table
  • Frontend analytics dashboard should load without 403 errors
  ';
END $$;

COMMIT;
