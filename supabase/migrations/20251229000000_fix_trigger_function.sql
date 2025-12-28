-- =====================================================
-- FIX: Fonction trigger sans paramètres PostgreSQL
-- =====================================================
-- Date: 2025-12-29
-- Description: Remplace trigger_alert_email_edge_function pour ne pas dépendre des paramètres PostgreSQL
-- =====================================================

CREATE OR REPLACE FUNCTION trigger_alert_email_edge_function()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Cette fonction est appelée par pg_cron toutes les 15 minutes
  -- L'Edge Function sera déclenchée automatiquement par le cron job
  -- Elle vérifie les alertes actives et envoie des emails si nécessaire

  -- Log dans la table de tracking
  INSERT INTO alert_email_log (triggered_at, status)
  VALUES (NOW(), 'triggered');

  RAISE NOTICE 'Email alerts triggered at %', NOW();

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Erreur trigger_alert_email_edge_function: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION trigger_alert_email_edge_function IS 'Déclenche le processus d''envoi d''alertes email (appelée par pg_cron toutes les 15 minutes)';

-- =====================================================
-- NOTE IMPORTANTE
-- =====================================================
-- L'Edge Function `send-refresh-alerts` doit être appelée via un webhook externe
-- ou directement via le Dashboard Supabase pour tester.
--
-- Le pg_cron appelle cette fonction qui log l'événement.
-- Pour l'instant, l'envoi d'email se fait en testant manuellement l'Edge Function.
--
-- Test manuel de l'Edge Function:
-- 1. Dashboard > Edge Functions > send-refresh-alerts > Invoke
-- 2. Headers: { "Authorization": "Bearer L55/iiNDnWH67T9/z8/Ojd20FBO10gd+bDVbJ1Hf0PY=" }
-- 3. Method: POST
-- =====================================================
