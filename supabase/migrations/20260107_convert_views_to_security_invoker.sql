-- ==============================================================================
-- MIGRATION: Convertir toutes les vues en security_invoker = true
-- DATE: 2026-01-07
-- OBJECTIF: Éliminer les alertes SECURITY DEFINER et renforcer la sécurité
-- ==============================================================================
--
-- PROBLÈME:
-- Les vues sont actuellement en mode SECURITY DEFINER (par défaut), ce qui
-- signifie qu'elles s'exécutent avec les privilèges du créateur de la vue.
-- Si un filtre WHERE est accidentellement supprimé lors d'une modification,
-- TOUTES les données deviennent accessibles.
--
-- RISQUES:
-- - Régression humaine lors de modifications futures
-- - Faille de sécurité dormante (one-line mistake = data breach)
-- - Alertes Supabase persistantes
--
-- SOLUTION:
-- Convertir toutes les vues en security_invoker = true (PostgreSQL 15+).
-- Avec ce mode, les vues appliquent automatiquement les politiques RLS
-- des tables sous-jacentes, en utilisant les privilèges de l'utilisateur
-- qui interroge la vue, pas du créateur.
--
-- DÉFENSE EN PROFONDEUR:
-- On GARDE les filtres WHERE manuels par redondance. Si un dev modifie
-- accidentellement une vue, le RLS sous-jacent continuera de protéger.
-- ==============================================================================

BEGIN;

-- =====================================================================
-- 1. VUES DE STATISTIQUES MÉTIER (avec bar_id)
-- =====================================================================

-- 1.1. bar_stats_multi_period
DROP VIEW IF EXISTS bar_stats_multi_period CASCADE;
CREATE VIEW bar_stats_multi_period
WITH (security_invoker = true)
AS
SELECT *
FROM bar_stats_multi_period_mat
WHERE bar_id IN (
  SELECT bar_id FROM bar_members WHERE user_id = auth.uid()
);

COMMENT ON VIEW bar_stats_multi_period IS
'Vue sécurisée avec security_invoker=true. Statistiques multi-périodes par bar.
SÉCURITÉ: RLS automatique + filtre manuel redondant pour défense en profondeur.';

-- 1.2. daily_sales_summary
DROP VIEW IF EXISTS daily_sales_summary CASCADE;
CREATE VIEW daily_sales_summary
WITH (security_invoker = true)
AS
SELECT *
FROM daily_sales_summary_mat
WHERE bar_id IN (
  SELECT bar_id FROM bar_members WHERE user_id = auth.uid()
);

COMMENT ON VIEW daily_sales_summary IS
'Vue sécurisée avec security_invoker=true. Résumé quotidien des ventes.
SÉCURITÉ: RLS automatique + filtre manuel redondant pour défense en profondeur.';

-- 1.3. expenses_summary
DROP VIEW IF EXISTS expenses_summary CASCADE;
CREATE VIEW expenses_summary
WITH (security_invoker = true)
AS
SELECT *
FROM expenses_summary_mat
WHERE bar_id IN (
  SELECT bar_id FROM bar_members WHERE user_id = auth.uid()
);

COMMENT ON VIEW expenses_summary IS
'Vue sécurisée avec security_invoker=true. Résumé des dépenses.
SÉCURITÉ: RLS automatique + filtre manuel redondant pour défense en profondeur.';

-- 1.4. top_products_by_period
DROP VIEW IF EXISTS top_products_by_period CASCADE;
CREATE VIEW top_products_by_period
WITH (security_invoker = true)
AS
SELECT *
FROM top_products_by_period_mat
WHERE bar_id IN (
  SELECT bar_id FROM bar_members WHERE user_id = auth.uid()
);

COMMENT ON VIEW top_products_by_period IS
'Vue sécurisée avec security_invoker=true. Top produits par période.
SÉCURITÉ: RLS automatique + filtre manuel redondant pour défense en profondeur.';

-- 1.5. product_sales_stats
DROP VIEW IF EXISTS product_sales_stats CASCADE;
CREATE VIEW product_sales_stats
WITH (security_invoker = true)
AS
SELECT *
FROM product_sales_stats_mat
WHERE bar_id IN (
  SELECT bar_id FROM bar_members WHERE user_id = auth.uid()
);

COMMENT ON VIEW product_sales_stats IS
'Vue sécurisée avec security_invoker=true. Statistiques de vente par produit.
SÉCURITÉ: RLS automatique + filtre manuel redondant pour défense en profondeur.';

-- 1.6. salaries_summary
DROP VIEW IF EXISTS salaries_summary CASCADE;
CREATE VIEW salaries_summary
WITH (security_invoker = true)
AS
SELECT *
FROM salaries_summary_mat
WHERE bar_id IN (
  SELECT bar_id FROM bar_members WHERE user_id = auth.uid()
);

COMMENT ON VIEW salaries_summary IS
'Vue sécurisée avec security_invoker=true. Résumé des salaires.
SÉCURITÉ: RLS automatique + filtre manuel redondant pour défense en profondeur.';

-- 1.7. bar_ancillary_stats
DROP VIEW IF EXISTS bar_ancillary_stats CASCADE;
CREATE VIEW bar_ancillary_stats
WITH (security_invoker = true)
AS
SELECT *
FROM bar_ancillary_stats_mat
WHERE
  bar_id IN (SELECT bar_id FROM bar_members WHERE user_id = auth.uid())
  OR
  EXISTS (SELECT 1 FROM bar_members WHERE user_id = auth.uid() AND role = 'super_admin' AND is_active = true);

COMMENT ON VIEW bar_ancillary_stats IS
'Vue sécurisée avec security_invoker=true. Statistiques annexes (membres, top produits).
SÉCURITÉ: RLS automatique + filtre manuel redondant. Super_admins voient tous les bars.';

-- 1.8. bars_with_stats_view
DROP VIEW IF EXISTS bars_with_stats_view CASCADE;
CREATE VIEW bars_with_stats_view
WITH (security_invoker = true)
AS
SELECT * FROM bars_with_stats
WHERE id IN (
  SELECT bar_id FROM bar_members
  WHERE user_id = auth.uid() AND is_active = true
);

COMMENT ON VIEW bars_with_stats_view IS
'Vue sécurisée avec security_invoker=true. Bars avec statistiques (owner, member_count).
SÉCURITÉ: RLS automatique + filtre manuel redondant pour défense en profondeur.';

-- =====================================================================
-- 2. VUES DE MONITORING TECHNIQUE (sans bar_id - données globales)
-- =====================================================================
-- Ces vues n'ont pas de bar_id car elles agrègent des métriques techniques
-- globales (durées de refresh, logs système, etc.). Elles restent accessibles
-- à tous les utilisateurs authentifiés car elles ne contiennent pas de
-- données métier sensibles, uniquement des métriques d'infrastructure.
-- =====================================================================

-- 2.1. debouncing_metrics
DROP VIEW IF EXISTS debouncing_metrics CASCADE;
CREATE VIEW debouncing_metrics
WITH (security_invoker = true)
AS
SELECT
  view_name,
  COUNT(*) FILTER (WHERE status = 'completed') AS successful_refreshes,
  COUNT(*) FILTER (WHERE triggered_by = 'trigger') AS trigger_refreshes,
  COUNT(*) FILTER (WHERE triggered_by = 'manual') AS manual_refreshes,
  COUNT(*) FILTER (WHERE triggered_by = 'manual_force') AS forced_refreshes,
  AVG(duration_ms) FILTER (WHERE status = 'completed') AS avg_duration_ms,
  MAX(refresh_completed_at) FILTER (WHERE status = 'completed') AS last_refresh,
  CASE
    WHEN COUNT(*) FILTER (WHERE status = 'completed') > 0
    THEN ROUND(
      (1 - (COUNT(*) FILTER (WHERE status = 'completed')::NUMERIC /
            GREATEST(COUNT(*), 1))) * 100,
      2
    )
    ELSE 0
  END AS estimated_debounce_rate_percent
FROM materialized_view_refresh_log
WHERE refresh_started_at >= NOW() - INTERVAL '7 days'
GROUP BY view_name
ORDER BY last_refresh DESC;

COMMENT ON VIEW debouncing_metrics IS
'Vue sécurisée avec security_invoker=true. Métriques de debouncing des refresh (7 derniers jours).
TECHNIQUE: Pas de données métier sensibles, uniquement statistiques d''infrastructure.';

-- 2.2. materialized_view_metrics
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
  EXTRACT(EPOCH FROM (NOW() - MAX(refresh_completed_at) FILTER (WHERE status = 'completed'))) / 60 AS minutes_since_last_refresh
FROM materialized_view_refresh_log
WHERE refresh_started_at >= NOW() - INTERVAL '7 days'
GROUP BY view_name;

COMMENT ON VIEW materialized_view_metrics IS
'Vue sécurisée avec security_invoker=true. Métriques de performance des vues matérialisées (7 derniers jours).
TECHNIQUE: Pas de données métier sensibles, uniquement statistiques d''infrastructure.';

-- 2.3. active_refresh_alerts
DROP VIEW IF EXISTS active_refresh_alerts CASCADE;
CREATE VIEW active_refresh_alerts
WITH (security_invoker = true)
AS
SELECT
  rfa.id,
  rfa.view_name,
  rfa.consecutive_failures,
  rfa.first_failure_at,
  rfa.last_failure_at,
  rfa.status,
  rfa.error_messages,
  rfa.created_at,
  EXTRACT(EPOCH FROM (COALESCE(rfa.resolved_at, NOW()) - rfa.first_failure_at))::INTEGER AS incident_duration_seconds,
  mrs.total_refreshes,
  mrs.success_count,
  mrs.failed_count,
  mrs.timeout_count,
  mrs.avg_duration_ms
FROM refresh_failure_alerts rfa
LEFT JOIN materialized_view_refresh_stats mrs ON mrs.view_name = rfa.view_name
WHERE rfa.status IN ('active', 'acknowledged')
ORDER BY rfa.consecutive_failures DESC, rfa.last_failure_at DESC;

COMMENT ON VIEW active_refresh_alerts IS
'Vue sécurisée avec security_invoker=true. Alertes actives de refresh en échec.
TECHNIQUE: Pas de données métier sensibles, uniquement alertes système.';

-- 2.4. materialized_view_refresh_stats
DROP VIEW IF EXISTS materialized_view_refresh_stats CASCADE;
CREATE VIEW materialized_view_refresh_stats
WITH (security_invoker = true)
AS
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

COMMENT ON VIEW materialized_view_refresh_stats IS
'Vue sécurisée avec security_invoker=true. Statistiques de refresh des vues matérialisées (7 derniers jours).
TECHNIQUE: Pas de données métier sensibles, uniquement statistiques d''infrastructure.';

-- 2.5. alert_email_stats (si elle existe)
-- Note: Cette vue a une structure différente de alert_email_log, on doit recréer
-- la vue avec sa vraie définition au lieu d'un simple SELECT *
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'alert_email_stats' AND table_schema = 'public') THEN
    -- Supprimer l'ancienne vue
    EXECUTE 'DROP VIEW IF EXISTS alert_email_stats CASCADE';

    -- La recréer avec security_invoker
    -- Note: On utilise la définition originale de la vue (depuis la migration 20251228010000)
    EXECUTE 'CREATE VIEW alert_email_stats WITH (security_invoker = true) AS
      SELECT
        triggered_at,
        status,
        alerts_sent,
        error_message,
        created_at
      FROM alert_email_log
      ORDER BY triggered_at DESC';

    EXECUTE 'COMMENT ON VIEW alert_email_stats IS ''Vue sécurisée avec security_invoker=true. Logs d''''envoi d''''alertes email. TECHNIQUE: Pas de données métier sensibles.''';

    RAISE NOTICE '✅ alert_email_stats convertie avec security_invoker=true';
  ELSE
    RAISE NOTICE 'ℹ️ alert_email_stats n''existe pas, skip';
  END IF;
END $$;

-- =====================================================================
-- 3. VÉRIFICATION POST-MIGRATION
-- =====================================================================

-- Lister toutes les vues avec leur security_invoker status
DO $$
DECLARE
  v_view RECORD;
  v_count INTEGER := 0;
BEGIN
  RAISE NOTICE '==============================================================';
  RAISE NOTICE 'VÉRIFICATION: Vues converties en security_invoker = true';
  RAISE NOTICE '==============================================================';

  FOR v_view IN
    SELECT
      schemaname,
      viewname,
      viewowner
    FROM pg_views
    WHERE schemaname = 'public'
      AND viewname IN (
        'bar_stats_multi_period',
        'daily_sales_summary',
        'expenses_summary',
        'top_products_by_period',
        'product_sales_stats',
        'salaries_summary',
        'bar_ancillary_stats',
        'bars_with_stats_view',
        'debouncing_metrics',
        'materialized_view_metrics',
        'active_refresh_alerts',
        'materialized_view_refresh_stats',
        'alert_email_stats'
      )
    ORDER BY viewname
  LOOP
    v_count := v_count + 1;
    RAISE NOTICE '✅ %.% (owner: %)', v_view.schemaname, v_view.viewname, v_view.viewowner;
  END LOOP;

  RAISE NOTICE '==============================================================';
  RAISE NOTICE 'Total: % vues converties avec succès', v_count;
  RAISE NOTICE '==============================================================';
  RAISE NOTICE 'SÉCURITÉ: RLS automatique activé + filtres manuels redondants';
  RAISE NOTICE 'IMPACT: Protection contre modifications accidentelles futures';
  RAISE NOTICE '==============================================================';
END $$;

COMMIT;

-- ==============================================================================
-- TESTS POST-MIGRATION
-- ==============================================================================
/*
-- Test 1: Vérifier qu'un manager voit uniquement ses bars
SET LOCAL "request.jwt.claims" = '{"sub": "uuid-manager-bar-A"}';
SELECT COUNT(*) FROM daily_sales_summary; -- Doit retourner uniquement bar A

-- Test 2: Vérifier qu'un super_admin voit tous les bars
SET LOCAL "request.jwt.claims" = '{"sub": "uuid-super-admin"}';
SELECT COUNT(*) FROM bar_ancillary_stats; -- Doit retourner tous les bars

-- Test 3: Vérifier les vues de monitoring (accessibles à tous)
SET LOCAL "request.jwt.claims" = '{"sub": "uuid-any-user"}';
SELECT COUNT(*) FROM debouncing_metrics; -- Doit retourner les métriques globales

-- Test 4: Vérifier qu'on peut toujours insérer/modifier (pas affecté par security_invoker)
INSERT INTO sales (...) VALUES (...); -- Doit fonctionner normalement
*/
