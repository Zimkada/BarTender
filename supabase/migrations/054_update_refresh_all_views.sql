-- 054_update_refresh_all_views.sql
-- Met à jour refresh_all_materialized_views pour inclure les nouvelles vues

CREATE OR REPLACE FUNCTION refresh_all_materialized_views(
  p_triggered_by TEXT DEFAULT 'manual'
)
RETURNS TABLE(view_name TEXT, log_id UUID, status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_view RECORD;
  v_log_id UUID;
BEGIN
  -- Liste des vues à rafraîchir dans l'ordre de dépendance
  FOR v_view IN 
    SELECT unnest(ARRAY[
      'product_sales_stats',
      'daily_sales_summary',      -- ✨ Maintenant avec retours
      'expenses_summary',          -- ✨ NOUVEAU
      'salaries_summary',          -- ✨ NOUVEAU
      'top_products_by_period',
      'bar_stats_multi_period'
    ]) AS name
  LOOP
    BEGIN
      v_log_id := refresh_materialized_view_with_logging(v_view.name, p_triggered_by);
      
      RETURN QUERY SELECT 
        v_view.name,
        v_log_id,
        'completed'::TEXT;
        
    EXCEPTION WHEN OTHERS THEN
      RETURN QUERY SELECT 
        v_view.name,
        NULL::UUID,
        'failed'::TEXT;
    END;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION refresh_all_materialized_views IS 'Rafraîchit toutes les vues matérialisées (incluant expenses_summary et salaries_summary)';
