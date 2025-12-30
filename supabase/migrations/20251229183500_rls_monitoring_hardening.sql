-- Migration: Scale Hardening for RLS Monitoring
-- Description: Ajout d'un Rate Limiting au logging des violations pour éviter la saturation à 1500+ utilisateurs
-- Date: 2025-12-29

CREATE OR REPLACE FUNCTION log_rls_violation(
  p_table_name TEXT,
  p_operation TEXT,
  p_attempted_bar_id UUID,
  p_error_message TEXT DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  v_user_bar_id UUID;
  v_recent_log_count INTEGER;
BEGIN
  -- 🛡️ RATE LIMITING : Ne pas logger plus de 5 violations par minute par utilisateur
  -- Évite la saturation de la base en cas d'attaque ou de bug client massif
  SELECT COUNT(*) INTO v_recent_log_count
  FROM rls_violations_log
  WHERE user_id = auth.uid()
    AND created_at > NOW() - INTERVAL '1 minute';

  IF v_recent_log_count >= 5 THEN
    -- On ignore silencieusement pour ne pas donner d'info à l'attaquant
    -- et surtout pour ne pas surcharger la base
    RETURN;
  END IF;

  -- Récupérer le bar_id de l'utilisateur (si possible)
  SELECT bar_id INTO v_user_bar_id
  FROM bar_members
  WHERE user_id = auth.uid() AND is_active = true
  LIMIT 1;

  -- Logger la violation
  INSERT INTO rls_violations_log (
    user_id,
    table_name,
    operation,
    attempted_bar_id,
    user_bar_id,
    error_message
  ) VALUES (
    auth.uid(),
    p_table_name,
    p_operation,
    p_attempted_bar_id,
    v_user_bar_id,
    p_error_message
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION log_rls_violation IS 'Logger une tentative d''accès non autorisé avec Rate Limiting (Hardened)';
