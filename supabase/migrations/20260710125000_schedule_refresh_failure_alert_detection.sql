-- MIGRATION: Brancher la détection d'alertes d'échecs de refresh (job cron manquant)
-- DATE: 2026-07-10
-- AUTHOR: BarTender

-- PROBLEM: Le SecurityDashboardPage (onglet Database) affiche une carte "Alertes
--   Actives" et une section dédiée, alimentées par la vue `active_refresh_alerts`
--   qui lit la table `refresh_failure_alerts`. Cette table a un unique producteur :
--   la fonction `create_or_update_failure_alerts()` (créée en
--   20251227000400_refresh_failure_alerts.sql). Or aucun appelant n'existe :
--   - Le frontend définit `MaterializedViewService.createOrUpdateFailureAlerts()`
--     mais ne l'invoque nulle part.
--   - Le job pg_cron `send-refresh-alerts-email` (20251228010000, */15min) appelle
--     `trigger_alert_email_edge_function()`, qui ne fait que logger un
--     RAISE NOTICE + une ligne dans `alert_email_log` — il ne détecte rien.
--   - L'Edge Function `send-refresh-alerts` ne fait que LIRE les alertes déjà
--     actives pour les emailer, jamais les créer.
--   Résultat : même 10 échecs consécutifs sur une vue ne créeraient jamais
--   d'alerte. La carte "Alertes Actives" affiche 0 en permanence par absence
--   de producteur, pas parce que le système est sain.

-- IMPACT: Aucun utilisateur final. Observabilité admin (SuperAdmin) uniquement.

-- SOLUTION: Créer un job pg_cron dédié qui appelle
--   `create_or_update_failure_alerts()` toutes les 15 minutes — même cadence que
--   le job d'envoi d'email existant, pour que ce dernier ait quelque chose à lire.
--   Job séparé (pas de fusion avec un job existant) : zéro risque sur le refresh
--   des vues ou l'envoi d'email, rollback trivial via cron.unschedule().

-- BREAKING_CHANGE: NO
-- RLS_CHANGES: none
-- IDEMPOTENT: OUI — cron.schedule fait un upsert sur le nom du job.

-- =====================================================
-- PRÉ-VOL (à exécuter avant, informatif — voir notes de session)
-- =====================================================
-- SELECT proname FROM pg_proc
-- WHERE proname IN ('create_or_update_failure_alerts', 'detect_consecutive_refresh_failures');
-- -- Attendu : 2 lignes
--
-- SELECT jobname, schedule, command FROM cron.job ORDER BY jobname;
-- -- Vérifier qu'aucun job n'appelle déjà create_or_update_failure_alerts

BEGIN;

DO $$
BEGIN
  -- Guard : pg_cron absent (dev sans extension) → ne rien faire, sans erreur.
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron non disponible — création du job de détection ignorée.';
    RETURN;
  END IF;

  PERFORM cron.schedule(
    'detect-refresh-failure-alerts',
    '*/15 * * * *',
    $job$SELECT create_or_update_failure_alerts()$job$
  );

  RAISE NOTICE 'Job ''detect-refresh-failure-alerts'' (re)créé à */15 * * * *.';
END
$$;

COMMIT;

-- =====================================================
-- POST-VOL (à exécuter après, informatif — voir notes de session)
-- =====================================================
-- SELECT jobname, schedule, command FROM cron.job
-- WHERE jobname = 'detect-refresh-failure-alerts';
-- -- Attendu : 1 ligne
--
-- SELECT * FROM create_or_update_failure_alerts();
-- -- Attendu : alerts_created = 0, alerts_updated = 0 (aucun échec consécutif actuellement)
--
-- SELECT * FROM refresh_failure_alerts ORDER BY created_at DESC LIMIT 5;
-- -- Attendu : vide (aucune alerte fantôme créée)

-- ROLLBACK (si besoin) :
-- SELECT cron.unschedule('detect-refresh-failure-alerts');
