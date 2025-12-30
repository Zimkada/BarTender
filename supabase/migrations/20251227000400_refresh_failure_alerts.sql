-- Migration: Alertes échecs refresh consécutifs
-- Description: Détection et notification des échecs répétés de refresh materialized views
-- Compatibilité: Supabase Free + Pro
-- Date: 2025-12-27

-- =====================================================
-- 1. TABLE DES ALERTES REFRESH
-- =====================================================

CREATE TABLE IF NOT EXISTS refresh_failure_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  view_name TEXT NOT NULL,
  consecutive_failures INTEGER NOT NULL,
  first_failure_at TIMESTAMPTZ NOT NULL,
  last_failure_at TIMESTAMPTZ NOT NULL,
  alert_sent_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('active', 'resolved', 'acknowledged')),
  error_messages TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes pour queries fréquentes
CREATE INDEX idx_refresh_alerts_view ON refresh_failure_alerts(view_name);
CREATE INDEX idx_refresh_alerts_status ON refresh_failure_alerts(status);
CREATE INDEX idx_refresh_alerts_created ON refresh_failure_alerts(created_at DESC);

-- RLS sur table des alertes (admin seulement)
ALTER TABLE refresh_failure_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SuperAdmin can view all alerts"
  ON refresh_failure_alerts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bar_members
      WHERE user_id = auth.uid()
        AND role = 'super_admin'
        AND is_active = true
    )
  );

CREATE POLICY "SuperAdmin can update alerts"
  ON refresh_failure_alerts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM bar_members
      WHERE user_id = auth.uid()
        AND role = 'super_admin'
        AND is_active = true
    )
  );

-- =====================================================
-- 2. FONCTION DÉTECTION ÉCHECS CONSÉCUTIFS
-- =====================================================

CREATE OR REPLACE FUNCTION detect_consecutive_refresh_failures()
RETURNS TABLE(
  view_name TEXT,
  consecutive_failures BIGINT,
  first_failure TIMESTAMPTZ,
  last_failure TIMESTAMPTZ,
  error_messages TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  WITH consecutive_failures AS (
    SELECT
      mrl.view_name,
      COUNT(*) AS failure_count,
      MIN(mrl.created_at) AS first_failure_at,
      MAX(mrl.created_at) AS last_failure_at,
      ARRAY_AGG(mrl.error_message ORDER BY mrl.created_at) AS errors
    FROM materialized_view_refresh_log mrl
    WHERE mrl.status IN ('failed', 'timeout')
      AND mrl.created_at > NOW() - INTERVAL '1 hour'
      AND NOT EXISTS (
        -- Vérifier qu'il n'y a pas de succès entre le premier et dernier échec
        SELECT 1 FROM materialized_view_refresh_log success
        WHERE success.view_name = mrl.view_name
          AND success.status = 'success'
          AND success.created_at > (
            SELECT MIN(created_at) FROM materialized_view_refresh_log fail
            WHERE fail.view_name = mrl.view_name
              AND fail.status IN ('failed', 'timeout')
              AND fail.created_at > NOW() - INTERVAL '1 hour'
          )
          AND success.created_at <= mrl.created_at
      )
    GROUP BY mrl.view_name
    HAVING COUNT(*) >= 3
  )
  SELECT
    cf.view_name,
    cf.failure_count,
    cf.first_failure_at,
    cf.last_failure_at,
    cf.errors
  FROM consecutive_failures cf
  ORDER BY cf.failure_count DESC, cf.last_failure_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 3. FONCTION CRÉATION/UPDATE ALERTES
-- =====================================================

CREATE OR REPLACE FUNCTION create_or_update_failure_alerts()
RETURNS TABLE(
  alerts_created INTEGER,
  alerts_updated INTEGER
) AS $$
DECLARE
  v_created INTEGER := 0;
  v_updated INTEGER := 0;
  v_failure_record RECORD;
  v_existing_alert_id UUID;
BEGIN
  -- Pour chaque vue avec échecs consécutifs
  FOR v_failure_record IN
    SELECT * FROM detect_consecutive_refresh_failures()
  LOOP
    -- Chercher alerte active existante
    SELECT id INTO v_existing_alert_id
    FROM refresh_failure_alerts
    WHERE view_name = v_failure_record.view_name
      AND status = 'active'
    LIMIT 1;

    IF v_existing_alert_id IS NOT NULL THEN
      -- Mettre à jour alerte existante
      UPDATE refresh_failure_alerts
      SET
        consecutive_failures = v_failure_record.consecutive_failures,
        last_failure_at = v_failure_record.last_failure,
        error_messages = v_failure_record.error_messages,
        updated_at = NOW()
      WHERE id = v_existing_alert_id;

      v_updated := v_updated + 1;
    ELSE
      -- Créer nouvelle alerte
      INSERT INTO refresh_failure_alerts (
        view_name,
        consecutive_failures,
        first_failure_at,
        last_failure_at,
        status,
        error_messages
      ) VALUES (
        v_failure_record.view_name,
        v_failure_record.consecutive_failures,
        v_failure_record.first_failure,
        v_failure_record.last_failure,
        'active',
        v_failure_record.error_messages
      );

      v_created := v_created + 1;
    END IF;
  END LOOP;

  -- Résoudre automatiquement les alertes dont les vues ont été refreshées avec succès
  UPDATE refresh_failure_alerts
  SET
    status = 'resolved',
    resolved_at = NOW()
  WHERE status = 'active'
    AND EXISTS (
      SELECT 1 FROM materialized_view_refresh_log
      WHERE view_name = refresh_failure_alerts.view_name
        AND status = 'success'
        AND created_at > refresh_failure_alerts.last_failure_at
    );

  RETURN QUERY SELECT v_created, v_updated;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 4. FONCTION ACKNOWLEDGEMENT ALERTE (POUR ADMINS)
-- =====================================================

CREATE OR REPLACE FUNCTION acknowledge_refresh_alert(
  p_alert_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_is_admin BOOLEAN;
BEGIN
  -- Vérifier que l'utilisateur est SuperAdmin
  SELECT EXISTS (
    SELECT 1 FROM bar_members
    WHERE user_id = auth.uid()
      AND role = 'super_admin'
      AND is_active = true
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Accès refusé: SuperAdmin uniquement';
  END IF;

  -- Mettre à jour le statut de l'alerte
  UPDATE refresh_failure_alerts
  SET
    status = 'acknowledged',
    alert_sent_at = NOW()
  WHERE id = p_alert_id
    AND status = 'active';

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 5. VUE DASHBOARD ALERTES ACTIVES
-- =====================================================

CREATE OR REPLACE VIEW active_refresh_alerts AS
SELECT
  rfa.id,
  rfa.view_name,
  rfa.consecutive_failures,
  rfa.first_failure_at,
  rfa.last_failure_at,
  rfa.status,
  rfa.error_messages,
  rfa.created_at,
  -- Calculer la durée de l'incident
  EXTRACT(EPOCH FROM (COALESCE(rfa.resolved_at, NOW()) - rfa.first_failure_at))::INTEGER AS incident_duration_seconds,
  -- Joindre les stats de refresh
  mrs.total_refreshes,
  mrs.success_count,
  mrs.failed_count,
  mrs.timeout_count,
  mrs.avg_duration_ms
FROM refresh_failure_alerts rfa
LEFT JOIN materialized_view_refresh_stats mrs ON mrs.view_name = rfa.view_name
WHERE rfa.status IN ('active', 'acknowledged')
ORDER BY rfa.consecutive_failures DESC, rfa.last_failure_at DESC;

-- =====================================================
-- 6. FONCTION CLEANUP ALERTES ANCIENNES
-- =====================================================

CREATE OR REPLACE FUNCTION cleanup_old_refresh_alerts()
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  -- Supprimer les alertes résolues de plus de 90 jours
  DELETE FROM refresh_failure_alerts
  WHERE status = 'resolved'
    AND resolved_at < NOW() - INTERVAL '90 days';

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RAISE NOTICE 'Cleaned up % old refresh alerts', v_deleted_count;

  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 7. PERMISSIONS
-- =====================================================

GRANT SELECT ON active_refresh_alerts TO authenticated;
GRANT EXECUTE ON FUNCTION detect_consecutive_refresh_failures TO authenticated;
GRANT EXECUTE ON FUNCTION create_or_update_failure_alerts TO authenticated;
GRANT EXECUTE ON FUNCTION acknowledge_refresh_alert TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_old_refresh_alerts TO authenticated;

-- Commentaires
COMMENT ON TABLE refresh_failure_alerts IS 'Alertes pour échecs consécutifs de refresh materialized views (3+ échecs)';
COMMENT ON FUNCTION detect_consecutive_refresh_failures IS 'Détecte vues avec 3+ échecs consécutifs sans succès intermédiaire';
COMMENT ON FUNCTION create_or_update_failure_alerts IS 'Créer/mettre à jour alertes basé sur échecs détectés';
COMMENT ON FUNCTION acknowledge_refresh_alert IS 'Permet SuperAdmin d''acknowledger une alerte active';
COMMENT ON VIEW active_refresh_alerts IS 'Dashboard alertes actives avec métriques refresh pour admins';
