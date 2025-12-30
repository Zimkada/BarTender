-- Migration: Monitoring RLS violations runtime
-- Description: Table + triggers pour détecter tentatives accès non autorisé
-- Compatibilité: Supabase Free + Pro
-- Date: 2025-12-26

-- =====================================================
-- 1. TABLE DE LOG DES VIOLATIONS RLS
-- =====================================================

CREATE TABLE IF NOT EXISTS rls_violations_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL, -- SELECT, INSERT, UPDATE, DELETE
  attempted_bar_id UUID,
  user_bar_id UUID,
  ip_address TEXT,
  user_agent TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour requêtes fréquentes
CREATE INDEX idx_rls_violations_user ON rls_violations_log(user_id);
CREATE INDEX idx_rls_violations_table ON rls_violations_log(table_name);
CREATE INDEX idx_rls_violations_created ON rls_violations_log(created_at DESC);

-- RLS sur table de log (admin seulement)
ALTER TABLE rls_violations_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SuperAdmin can view all violations"
  ON rls_violations_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bar_members
      WHERE user_id = auth.uid()
        AND role = 'super_admin'
        AND is_active = true
    )
  );

-- =====================================================
-- 2. FONCTION DE LOGGING VIOLATION
-- =====================================================

CREATE OR REPLACE FUNCTION log_rls_violation(
  p_table_name TEXT,
  p_operation TEXT,
  p_attempted_bar_id UUID,
  p_error_message TEXT DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  v_user_bar_id UUID;
BEGIN
  -- Récupérer le bar_id de l'utilisateur
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

-- =====================================================
-- 3. FONCTION DE VÉRIFICATION VIOLATIONS RÉCENTES
-- =====================================================

CREATE OR REPLACE FUNCTION check_recent_rls_violations()
RETURNS TABLE(
  user_id UUID,
  user_email TEXT,
  violation_count BIGINT,
  tables_affected TEXT[],
  last_violation TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    v.user_id,
    u.email,
    COUNT(*) AS violation_count,
    ARRAY_AGG(DISTINCT v.table_name) AS tables_affected,
    MAX(v.created_at) AS last_violation
  FROM rls_violations_log v
  LEFT JOIN auth.users u ON u.id = v.user_id
  WHERE v.created_at > NOW() - INTERVAL '1 hour'
  GROUP BY v.user_id, u.email
  HAVING COUNT(*) >= 3 -- 3+ violations en 1h = suspect
  ORDER BY violation_count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 4. VUE DASHBOARD ADMIN SÉCURITÉ
-- =====================================================

CREATE OR REPLACE VIEW admin_security_dashboard AS
SELECT 
  DATE_TRUNC('hour', created_at) AS hour,
  table_name,
  operation,
  COUNT(*) AS violation_count,
  COUNT(DISTINCT user_id) AS unique_users,
  ARRAY_AGG(DISTINCT user_id) AS user_ids
FROM rls_violations_log
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', created_at), table_name, operation
ORDER BY hour DESC, violation_count DESC;

-- Permissions
GRANT SELECT ON admin_security_dashboard TO authenticated;

-- =====================================================
-- 5. NETTOYAGE AUTOMATIQUE LOGS ANCIENS
-- =====================================================

CREATE OR REPLACE FUNCTION cleanup_old_rls_violations()
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  -- Garder seulement 90 jours de logs
  DELETE FROM rls_violations_log
  WHERE created_at < NOW() - INTERVAL '90 days';
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  RAISE NOTICE 'Cleaned up % old RLS violation logs', v_deleted_count;
  
  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 6. PERMISSIONS
-- =====================================================

GRANT EXECUTE ON FUNCTION log_rls_violation TO authenticated;
GRANT EXECUTE ON FUNCTION check_recent_rls_violations TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_old_rls_violations TO authenticated;

-- Commentaires
COMMENT ON TABLE rls_violations_log IS 'Historique des tentatives d''accès non autorisé (violations RLS)';
COMMENT ON FUNCTION log_rls_violation IS 'Logger une tentative d''accès non autorisé';
COMMENT ON FUNCTION check_recent_rls_violations IS 'Identifier utilisateurs avec violations suspectes';
COMMENT ON VIEW admin_security_dashboard IS 'Dashboard admin pour monitoring sécurité';
