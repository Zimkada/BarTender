-- 050_fix_bar_stats_refresh.sql
-- Adds missing refresh function for bar_stats_multi_period_mat (P0 Correction)

CREATE OR REPLACE FUNCTION refresh_bar_stats_multi_period()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM refresh_materialized_view_with_logging('bar_stats_multi_period', 'trigger');
END;
$$;

COMMENT ON FUNCTION refresh_bar_stats_multi_period IS 'Rafraîchit la vue bar_stats_multi_period_mat de manière concurrente';
