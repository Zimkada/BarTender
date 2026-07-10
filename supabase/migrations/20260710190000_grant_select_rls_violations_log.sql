-- MIGRATION: GRANT SELECT sur rls_violations_log (403 sur admin_security_dashboard)
-- DATE: 2026-07-10
-- AUTHOR: BarTender

-- PROBLEM: La vue admin_security_dashboard est passée en security_invoker=true
--   (20260107_add_security_invoker_to_admin_views.sql) : elle lit désormais
--   rls_violations_log avec les droits de l'appelant. Or aucune migration n'a
--   jamais accordé SELECT sur cette table au rôle authenticated — seule la vue
--   avait un GRANT, suffisant du temps où elle s'exécutait avec les droits de
--   son propriétaire (postgres), plus depuis la conversion security_invoker.
--   Résultat : GET /rest/v1/admin_security_dashboard → 403 Forbidden, y compris
--   pour le super_admin. Le frontend (SecurityService.getSecurityDashboard)
--   avale l'erreur et retourne [] — heatmap RLS vide en silence.
--   Même cause pour getRLSViolationsHistory() qui lit la table directement.
--   Pré-vol 10/07/2026 : has_table_privilege('authenticated',
--   'public.rls_violations_log', 'SELECT') = false. Même schéma d'incident que
--   refresh_failure_alerts (cf. 20260710180000_restore_active_refresh_alerts_view.sql).

-- IMPACT: Aucun utilisateur final. Observabilité admin (SuperAdmin) uniquement.

-- SOLUTION: GRANT SELECT à authenticated sur la table. Sûr : la politique RLS
--   "SuperAdmin can view all violations" (20251226224200_rls_monitoring.sql)
--   reste active — les rôles non-super_admin reçoivent 0 ligne, jamais les
--   données. REVOKE anon/PUBLIC en défense en profondeur.
--   NOTE : le 404 sur admin_bars_health_status observé dans la même console est
--   un état ATTENDU (vue du système Heartbeat pas encore créée, fonctionnalité
--   en cours de déploiement) — aucune action ici.

-- BREAKING_CHANGE: NO
-- RLS_CHANGES: GRANT SELECT à authenticated sur rls_violations_log (RLS
--   SuperAdmin-only inchangée et toujours appliquée).
-- IDEMPOTENT: OUI — GRANT/REVOKE réexécutables sans effet de bord.

-- =====================================================
-- PRÉ-VOL (à exécuter avant, informatif — voir notes de session)
-- =====================================================
-- SELECT has_table_privilege('authenticated', 'public.rls_violations_log', 'SELECT') AS table_grant_ok;
-- -- Audit du 10/07/2026 : false
--
-- SELECT polname FROM pg_policy WHERE polrelid = 'public.rls_violations_log'::regclass;
-- -- Attendu : au moins "SuperAdmin can view all violations" (policy SELECT)

BEGIN;

GRANT SELECT ON rls_violations_log TO authenticated;
REVOKE ALL ON rls_violations_log FROM anon, PUBLIC;

COMMIT;

-- =====================================================
-- POST-VOL (à exécuter après, informatif — voir notes de session)
-- =====================================================
-- SELECT has_table_privilege('authenticated', 'public.rls_violations_log', 'SELECT') AS table_grant_ok;
-- -- Attendu : true
--
-- SELECT has_table_privilege('anon', 'public.rls_violations_log', 'SELECT') AS anon_blocked;
-- -- Attendu : false
--
-- Smoke-test final (auth.uid() = NULL dans le SQL Editor, RLS non testable ici) :
-- recharger /admin/security → onglet "Infrastructure (Tech)" en super_admin.
-- Attendu : plus de 403 sur admin_security_dashboard dans la console réseau,
-- plus de warning "[Security] Dashboard unreachable". Le 404 sur
-- admin_bars_health_status persiste : normal (Heartbeat pas encore déployé).

-- ROLLBACK (si besoin) :
-- REVOKE SELECT ON rls_violations_log FROM authenticated;
