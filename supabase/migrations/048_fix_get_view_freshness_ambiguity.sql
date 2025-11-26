-- 048_fix_get_view_freshness_ambiguity.sql
-- Fixes the "column reference view_name is ambiguous" error in get_view_freshness function

CREATE OR REPLACE FUNCTION get_view_freshness(p_view_name TEXT)
RETURNS TABLE(
  view_name TEXT,
  last_refresh TIMESTAMPTZ,
  minutes_old NUMERIC,
  is_stale BOOLEAN
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p_view_name,
    MAX(log.refresh_completed_at) FILTER (WHERE log.status = 'completed'),
    EXTRACT(EPOCH FROM (NOW() - MAX(log.refresh_completed_at) FILTER (WHERE log.status = 'completed'))) / 60,
    EXTRACT(EPOCH FROM (NOW() - MAX(log.refresh_completed_at) FILTER (WHERE log.status = 'completed'))) / 60 > 60 -- Stale si > 1h
  FROM materialized_view_refresh_log log
  WHERE log.view_name = p_view_name;
END;
$$;

COMMENT ON FUNCTION get_view_freshness IS 'Vérifie la fraîcheur d''une vue matérialisée (Fix ambiguité colonne)';
