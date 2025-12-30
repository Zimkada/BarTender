-- Migration: Fix check_recent_rls_violations function
-- Description: Remove auth.users dependency, return user_id as text
-- Date: 2025-12-27

-- =====================================================
-- FIX: FONCTION CHECK VIOLATIONS SANS auth.users
-- =====================================================

DROP FUNCTION IF EXISTS check_recent_rls_violations();

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
    v.user_id::TEXT AS user_email, -- Use user_id as email placeholder
    COUNT(*)::BIGINT AS violation_count,
    ARRAY_AGG(DISTINCT v.table_name) AS tables_affected,
    MAX(v.created_at) AS last_violation
  FROM rls_violations_log v
  WHERE v.created_at > NOW() - INTERVAL '1 hour'
  GROUP BY v.user_id
  HAVING COUNT(*) >= 3 -- 3+ violations en 1h = suspect
  ORDER BY COUNT(*) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Permissions
GRANT EXECUTE ON FUNCTION check_recent_rls_violations TO authenticated;

-- Commentaire
COMMENT ON FUNCTION check_recent_rls_violations IS 'Détecte utilisateurs avec 3+ violations RLS dans la dernière heure (email = user_id pour éviter dépendance auth.users)';
