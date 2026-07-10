-- MIGRATION: Recréer la vue active_refresh_alerts (supprimée par erreur en cascade)
-- DATE: 2026-07-10
-- AUTHOR: BarTender

-- PROBLEM: La migration 20260107_convert_views_to_security_invoker.sql recrée
--   active_refresh_alerts en section 2.3, puis exécute en section 2.4
--   `DROP VIEW IF EXISTS materialized_view_refresh_stats CASCADE` — le CASCADE
--   a emporté active_refresh_alerts (qui dépend de materialized_view_refresh_stats
--   via un LEFT JOIN), et la vue n'a jamais été recréée après coup.
--   Résultat : la vue est absente depuis le 07/01/2026. Le frontend
--   (SecurityService.getActiveRefreshAlerts, security.service.ts) avale l'erreur
--   42P01 dans un catch silencieux et retourne [] — la carte "Alertes Actives"
--   du SecurityDashboardPage affiche 0 en permanence, y compris depuis que le
--   producteur d'alertes a été branché (20260710125000_schedule_refresh_
--   failure_alert_detection.sql). L'Edge Function send-refresh-alerts, qui lit
--   aussi cette vue pour l'envoi d'email, était affectée de la même façon.

-- IMPACT: Aucun utilisateur final. Observabilité admin (SuperAdmin) uniquement.

-- SOLUTION: Recréer la vue à l'identique de sa définition d'origine (section 2.3
--   de la migration du 07/01), avec GRANT SELECT explicite sur la vue ET sur la
--   table refresh_failure_alerts — un audit pré-vol (10/07/2026) a montré que le
--   rôle authenticated n'avait plus SELECT sur refresh_failure_alerts (révoqué
--   lors d'une vague de durcissement RLS antérieure), ce qui aurait laissé la
--   vue recréée vide même après correction du CASCADE.
--   Purge en même temps des 2 entrées 'sales_history' dans
--   materialized_view_refresh_log : entrées fantômes issues d'un bug frontend
--   sans rapport (DataFreshnessIndicator pointant vers une vue jamais créée,
--   corrigé côté code dans le même lot — retrait de l'indicateur sur
--   SalesHistoryPage). Purge nécessaire pour éviter qu'un 3e clic avant
--   déploiement du fix ne déclenche une alerte fantôme (seuil = 3 échecs
--   consécutifs) une fois cette vue à nouveau lisible.

-- BREAKING_CHANGE: NO
-- RLS_CHANGES: GRANT SELECT à authenticated sur refresh_failure_alerts (déjà
--   protégée par RLS SuperAdmin-only, cf. 20251227000400) et sur la vue
--   active_refresh_alerts (security_invoker=true, hérite de la même RLS).
-- IDEMPOTENT: OUI — DROP VIEW IF EXISTS avant recréation, GRANT/REVOKE réexécutables.

-- =====================================================
-- PRÉ-VOL (à exécuter avant, informatif — voir notes de session)
-- =====================================================
-- SELECT * FROM materialized_view_refresh_stats LIMIT 1;
-- -- Attendu : dépendance existante, aucune erreur
--
-- SELECT has_table_privilege('authenticated', 'public.refresh_failure_alerts', 'SELECT') AS table_grant_ok;
-- -- Audit du 10/07/2026 : false (grant manquant, cf. SOLUTION ci-dessus)
--
-- SELECT EXISTS (
--   SELECT 1 FROM bar_members WHERE role = 'super_admin' AND is_active = true
-- ) AS superadmin_policy_ok;
-- -- Attendu : true (sinon la policy RLS de refresh_failure_alerts ne laissera jamais rien passer)

BEGIN;

DROP VIEW IF EXISTS active_refresh_alerts;

CREATE VIEW active_refresh_alerts
WITH (security_invoker = true) AS
SELECT
  rfa.id,
  rfa.view_name,
  rfa.consecutive_failures,
  rfa.first_failure_at,
  rfa.last_failure_at,
  rfa.status,
  rfa.error_messages,
  rfa.created_at,
  EXTRACT(EPOCH FROM (COALESCE(rfa.resolved_at, NOW()) - rfa.first_failure_at))::INTEGER
    AS incident_duration_seconds,
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
Recréée le 2026-07-10 après suppression accidentelle par CASCADE (20260107_convert_views_to_security_invoker.sql).';

REVOKE ALL ON active_refresh_alerts FROM anon, PUBLIC;
GRANT SELECT ON active_refresh_alerts TO authenticated;

-- Requis (pré-vol 10/07/2026 : table_grant_ok = false). RLS SuperAdmin-only
-- sur refresh_failure_alerts (20251227000400) rend ce GRANT sûr : les rôles
-- non-super_admin reçoivent 0 ligne, jamais une erreur de permission.
GRANT SELECT ON refresh_failure_alerts TO authenticated;
REVOKE ALL ON refresh_failure_alerts FROM anon, PUBLIC;

-- Purge des entrées fantômes 'sales_history' (bug frontend corrigé dans le même lot)
DELETE FROM materialized_view_refresh_log WHERE view_name = 'sales_history';

COMMIT;

-- =====================================================
-- POST-VOL (à exécuter après, informatif — voir notes de session)
-- =====================================================
-- SELECT * FROM active_refresh_alerts;
-- -- Attendu : 0 ligne, aucune erreur (plus de 42P01)
--
-- SELECT has_table_privilege('authenticated', 'public.refresh_failure_alerts', 'SELECT') AS table_grant_ok;
-- -- Attendu : true
--
-- SELECT has_table_privilege('anon', 'public.active_refresh_alerts', 'SELECT') AS anon_blocked_view;
-- -- Attendu : false
--
-- SELECT has_table_privilege('anon', 'public.refresh_failure_alerts', 'SELECT') AS anon_blocked_table;
-- -- Attendu : false
--
-- SELECT COUNT(*) FROM materialized_view_refresh_log WHERE view_name = 'sales_history';
-- -- Attendu : 0
--
-- Smoke-test final (auth.uid() = NULL dans le SQL Editor, RLS non testable ici) :
-- ouvrir /admin/security → onglet "Infrastructure (Tech)" connecté en super_admin,
-- vérifier que la carte "Alertes Actives" affiche 0 sans erreur console (plus de 42P01).

-- ROLLBACK (si besoin) :
-- DROP VIEW IF EXISTS active_refresh_alerts;
-- REVOKE SELECT ON refresh_failure_alerts FROM authenticated;
