-- Migration: Ajout de bar_ancillary_stats_mat à la fonction de rafraîchissement global des vues matérialisées.
-- Date: 2025-12-15 21:00:00
-- Description: Met à jour la fonction 'refresh_all_materialized_views' pour inclure la nouvelle vue bar_ancillary_stats_mat.

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
      'daily_sales_summary',
      'expenses_summary',
      'salaries_summary',
      'top_products_by_period',
      'bar_stats_multi_period',
      'bar_ancillary_stats_mat' -- ✨ NOUVEAU: Ajout de notre vue pour les stats annexes
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

COMMENT ON FUNCTION refresh_all_materialized_views IS 'Rafraîchit toutes les vues matérialisées (incluant expenses_summary, salaries_summary, et bar_ancillary_stats_mat)';

-- Notifier Supabase de recharger le schéma pour PostgREST
NOTIFY pgrst, 'reload schema';
