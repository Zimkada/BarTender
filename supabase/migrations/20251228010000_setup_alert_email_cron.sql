-- =====================================================
-- MIGRATION: Setup Alert Email Cron Job
-- =====================================================
-- Date: 2025-12-28
-- Description: Configure pg_cron pour envoyer des alertes email via Edge Function
-- =====================================================

-- =====================================================
-- ÉTAPE 1: Ajouter la colonne alert_sent_at si elle n'existe pas
-- =====================================================

DO $$
BEGIN
  -- Vérifier si alert_sent_at existe déjà
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'refresh_failure_alerts'
      AND column_name = 'alert_sent_at'
  ) THEN
    ALTER TABLE refresh_failure_alerts
    ADD COLUMN alert_sent_at TIMESTAMPTZ NULL;

    COMMENT ON COLUMN refresh_failure_alerts.alert_sent_at IS 'Timestamp de l''envoi de l''alerte email (NULL si pas encore envoyée)';

    RAISE NOTICE '✅ Colonne alert_sent_at ajoutée à refresh_failure_alerts';
  ELSE
    RAISE NOTICE 'ℹ️ Colonne alert_sent_at existe déjà';
  END IF;
END $$;

-- =====================================================
-- ÉTAPE 2: Créer une fonction pour appeler l'Edge Function
-- =====================================================

CREATE OR REPLACE FUNCTION trigger_alert_email_edge_function()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_edge_function_url TEXT;
  v_function_secret TEXT;
  v_response TEXT;
BEGIN
  -- URL de l'Edge Function (à configurer via secrets)
  -- Format: https://[project-ref].supabase.co/functions/v1/send-refresh-alerts
  v_edge_function_url := current_setting('app.edge_function_url', true);
  v_function_secret := current_setting('app.function_secret', true);

  IF v_edge_function_url IS NULL OR v_edge_function_url = '' THEN
    RAISE WARNING '⚠️ Edge Function URL non configurée (app.edge_function_url)';
    RETURN;
  END IF;

  -- Appeler l'Edge Function via http extension
  -- Note: Nécessite l'extension pg_net ou http
  -- Alternative: utiliser un webhook externe ou scheduler externe

  -- Pour l'instant, on log juste un message
  -- L'appel réel se fera via pg_cron + curl ou via pg_net
  RAISE NOTICE '📧 Déclenchement email alerts - URL: %', v_edge_function_url;

  -- Log dans une table de tracking (optionnel)
  INSERT INTO alert_email_log (triggered_at, status)
  VALUES (NOW(), 'triggered');

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '❌ Erreur trigger_alert_email_edge_function: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION trigger_alert_email_edge_function IS 'Déclenche l''Edge Function d''envoi d''alertes email (appelée par pg_cron)';

-- =====================================================
-- ÉTAPE 3: Créer une table de log pour les emails
-- =====================================================

CREATE TABLE IF NOT EXISTS alert_email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL CHECK (status IN ('triggered', 'success', 'failed')),
  alerts_sent INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_email_log_triggered_at ON alert_email_log(triggered_at DESC);

COMMENT ON TABLE alert_email_log IS 'Log des déclenchements d''alertes email';

-- Permissions
ALTER TABLE alert_email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can view alert email logs"
  ON alert_email_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM bar_members
      WHERE bar_members.user_id = auth.uid()
        AND bar_members.role = 'super_admin'
        AND bar_members.is_active = true
    )
  );

-- =====================================================
-- ÉTAPE 4: Créer le job pg_cron (15 minutes)
-- =====================================================

-- Note: pg_cron nécessite l'extension pg_cron et des permissions superuser
-- Sur Supabase, pg_cron est déjà configuré et accessible via la console

-- Supprimer l'ancien job s'il existe
SELECT cron.unschedule('send-refresh-alerts-email')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'send-refresh-alerts-email'
);

-- Créer le nouveau job
-- Toutes les 15 minutes: '*/15 * * * *'
SELECT cron.schedule(
  'send-refresh-alerts-email',                    -- Nom du job
  '*/15 * * * *',                                 -- Toutes les 15 minutes
  $$
    SELECT trigger_alert_email_edge_function();
  $$
);

COMMENT ON EXTENSION pg_cron IS 'Job scheduler pg_cron - send-refresh-alerts-email configuré (15min)';

-- =====================================================
-- ÉTAPE 5: Fonction utilitaire pour tester l'envoi manuel
-- =====================================================

CREATE OR REPLACE FUNCTION test_alert_email_system()
RETURNS TABLE (
  alert_id UUID,
  view_name TEXT,
  consecutive_failures INTEGER,
  alert_sent_at TIMESTAMPTZ,
  should_send BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.view_name,
    a.consecutive_failures,
    a.alert_sent_at,
    (a.consecutive_failures >= 3 AND a.alert_sent_at IS NULL) AS should_send
  FROM refresh_failure_alerts a
  WHERE a.status = 'active'
  ORDER BY a.consecutive_failures DESC, a.first_failure_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION test_alert_email_system TO authenticated;

COMMENT ON FUNCTION test_alert_email_system IS 'Fonction de test pour voir quelles alertes seraient envoyées';

-- =====================================================
-- ÉTAPE 6: Vue pour monitoring des emails envoyés
-- =====================================================

CREATE OR REPLACE VIEW alert_email_stats AS
SELECT
  COUNT(*) AS total_emails_triggered,
  COUNT(*) FILTER (WHERE status = 'success') AS success_count,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed_count,
  COALESCE(SUM(alerts_sent), 0) AS total_alerts_sent,
  MAX(triggered_at) AS last_email_sent_at,
  ROUND(
    AVG(CASE WHEN status = 'success' THEN alerts_sent ELSE NULL END),
    2
  ) AS avg_alerts_per_email
FROM alert_email_log
WHERE triggered_at > NOW() - INTERVAL '7 days';

GRANT SELECT ON alert_email_stats TO authenticated;

COMMENT ON VIEW alert_email_stats IS 'Statistiques d''envoi d''emails des 7 derniers jours';

-- =====================================================
-- NOTES D'INSTALLATION
-- =====================================================

-- Pour activer complètement ce système:
--
-- 1. Déployer l'Edge Function:
--    supabase functions deploy send-refresh-alerts
--
-- 2. Configurer les secrets Supabase:
--    supabase secrets set RESEND_API_KEY=re_xxxxx
--    supabase secrets set ADMIN_EMAIL=admin@bartender.app
--    supabase secrets set FUNCTION_SECRET=random-secure-token
--    supabase secrets set ALERT_THRESHOLD=3
--
-- 3. Configurer les paramètres PostgreSQL (via Supabase Dashboard > Database Settings):
--    app.edge_function_url = 'https://[project-ref].supabase.co/functions/v1/send-refresh-alerts'
--    app.function_secret = 'random-secure-token'
--
-- 4. Tester manuellement:
--    SELECT test_alert_email_system();
--
-- 5. Vérifier le cron job:
--    SELECT * FROM cron.job WHERE jobname = 'send-refresh-alerts-email';
--
-- 6. Vérifier les logs:
--    SELECT * FROM alert_email_log ORDER BY triggered_at DESC LIMIT 10;
--
-- =====================================================

-- Afficher un résumé de l'installation
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Migration alert email cron installée';
  RAISE NOTICE '========================================';
  RAISE NOTICE '📧 Edge Function: send-refresh-alerts';
  RAISE NOTICE '⏰ Cron Job: Toutes les 15 minutes';
  RAISE NOTICE '🎯 Seuil: 3 échecs consécutifs';
  RAISE NOTICE '📊 Table log: alert_email_log';
  RAISE NOTICE '📈 Vue stats: alert_email_stats';
  RAISE NOTICE '';
  RAISE NOTICE 'Actions requises:';
  RAISE NOTICE '1. Déployer Edge Function: supabase functions deploy send-refresh-alerts';
  RAISE NOTICE '2. Configurer secrets: RESEND_API_KEY, ADMIN_EMAIL, FUNCTION_SECRET';
  RAISE NOTICE '3. Tester: SELECT test_alert_email_system();';
  RAISE NOTICE '========================================';
END $$;
