-- =====================================================
-- SOLUTION: Utiliser pg_net pour appeler l'Edge Function
-- =====================================================
-- Date: 2025-12-29
-- Description: Appelle l'Edge Function via HTTP avec pg_net
-- =====================================================

-- Activer l'extension pg_net si pas déjà fait
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Recréer la fonction avec appel HTTP via pg_net
CREATE OR REPLACE FUNCTION trigger_alert_email_edge_function()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request_id BIGINT;
  v_edge_function_url TEXT;
  v_function_secret TEXT;
BEGIN
  -- URL de l'Edge Function (hardcodée car on ne peut pas utiliser ALTER DATABASE)
  v_edge_function_url := 'https://yekomwjdznvtnialpdcz.supabase.co/functions/v1/send-refresh-alerts';
  v_function_secret := 'L55/iiNDnWH67T9/z8/Ojd20FBO10gd+bDVbJ1Hf0PY=';

  -- Appeler l'Edge Function via pg_net
  SELECT net.http_post(
    url := v_edge_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_function_secret
    ),
    body := '{}'::jsonb
  ) INTO v_request_id;

  -- Log l'appel
  INSERT INTO alert_email_log (triggered_at, status)
  VALUES (NOW(), 'triggered');

  RAISE NOTICE 'Edge Function appelée - Request ID: %', v_request_id;

EXCEPTION
  WHEN OTHERS THEN
    -- Log l'erreur
    INSERT INTO alert_email_log (triggered_at, status, error_message)
    VALUES (NOW(), 'failed', SQLERRM);

    RAISE WARNING 'Erreur trigger_alert_email_edge_function: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION trigger_alert_email_edge_function IS 'Appelle l''Edge Function send-refresh-alerts via pg_net (HTTP POST)';

-- Test de la fonction
SELECT trigger_alert_email_edge_function();

-- Vérifier le résultat
SELECT * FROM alert_email_log ORDER BY triggered_at DESC LIMIT 5;
