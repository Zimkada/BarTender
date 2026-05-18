-- Migration: Fix ambiguïté de colonne "status" dans refresh_all_materialized_views
--
-- Bug : la fonction refresh_all_materialized_views() déclare RETURNS TABLE
-- avec une colonne nommée 'status'. Dans la boucle, elle fait :
--
--   SELECT status INTO v_actual_status
--   FROM materialized_view_refresh_log
--   WHERE id = v_log_id;
--
-- PostgreSQL ne sait pas si 'status' réfère à la colonne de la table ou à la
-- variable de retour de la fonction → erreur 42702 'column reference "status"
-- is ambiguous'. Cette erreur est silencieusement catchée par le bloc
-- EXCEPTION WHEN OTHERS THEN qui retourne 'failed' à tort.
--
-- Conséquence visible : depuis l'incident PGRST003 du 18 mai 2026, les appels
-- manuels à refresh_all_materialized_views() retournent toujours 'failed' pour
-- les 6 vues, alors que :
--   1. Les vues sont bel et bien rafraîchies (refresh_materialized_view_with_logging
--      est appelé en premier et marche)
--   2. Le log materialized_view_refresh_log enregistre 'success'
--   3. Seule la valeur retournée par le wrapper est faussée
--
-- pg_cron rencontre le même bug mais cron.job_run_details enregistre 'succeeded'
-- car la fonction retourne quelque chose (peu importe que ce soit 'failed').
--
-- Solution : préfixer 'status' avec le nom de la table pour lever l'ambiguïté.

CREATE OR REPLACE FUNCTION public.refresh_all_materialized_views(
  p_triggered_by TEXT DEFAULT 'manual'
)
RETURNS TABLE(view_name TEXT, log_id UUID, status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_view          RECORD;
  v_log_id        UUID;
  v_actual_status TEXT;
BEGIN
  FOR v_view IN
    SELECT unnest(ARRAY[
      'product_sales_stats',
      'daily_sales_summary',
      'expenses_summary',
      -- 'salaries_summary' retiré : salaries_summary_mat est une VIEW normale (relkind='v'),
      --   pas une materialized view. Toujours fraîche, REFRESH inutile et erroné.
      'top_products_by_period',
      'bar_stats_multi_period',
      'bar_ancillary_stats'   -- Corrigé : était 'bar_ancillary_stats_mat' → double _mat bug
    ]) AS name
  LOOP
    BEGIN
      v_log_id := refresh_materialized_view_with_logging(v_view.name, p_triggered_by);

      -- Fix ambiguïté : préfixer 'status' par le nom de table pour éviter le
      -- conflit avec la variable de retour 'status' de RETURNS TABLE.
      -- Sans préfixe, erreur 42702 'column reference "status" is ambiguous'
      -- catchée silencieusement par EXCEPTION WHEN OTHERS → faux 'failed'.
      SELECT mvrl.status INTO v_actual_status
      FROM materialized_view_refresh_log mvrl
      WHERE mvrl.id = v_log_id;

      RETURN QUERY SELECT v_view.name, v_log_id, COALESCE(v_actual_status, 'failed')::TEXT;

    EXCEPTION WHEN OTHERS THEN
      RETURN QUERY SELECT v_view.name, NULL::UUID, 'failed'::TEXT;
    END;
  END LOOP;
END;
$function$;

COMMENT ON FUNCTION public.refresh_all_materialized_views IS
'Rafraîchit toutes les vues matérialisées et retourne le status de chacune.
Fix 18 mai 2026 : ambiguïté SELECT status → préfixé avec alias de table pour
éviter le conflit avec la variable de retour ''status''.';
