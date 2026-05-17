-- Migration: Augmenter la fréquence du job pg_cron de refresh des vues matérialisées
--
-- Contexte : sur le plan Supabase Pro, le job 'refresh-materialized-views-hc'
-- était configuré toutes les heures (0 * * * *). Pour la crédibilité de
-- l'application (comptabilité, dashboard, stats temps réel), on passe à
-- toutes les 5 minutes (*/5 * * * *).
--
-- Pas de coût supplémentaire : pg_cron sur Pro est illimité en nombre
-- d'exécutions. La fonction refresh_all_materialized_views couvre déjà
-- les 6 vues matérialisées (product_sales_stats, daily_sales_summary,
-- expenses_summary, top_products_by_period, bar_stats_multi_period,
-- bar_ancillary_stats).
--
-- Si le job n'existe pas (environnement de dev sans pg_cron actif),
-- la migration est idempotente : ne fait rien et ne lève pas d'erreur.

DO $$
DECLARE
  v_job_id BIGINT;
BEGIN
  -- Vérifier que pg_cron est disponible (Pro plan uniquement)
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron extension non disponible — migration ignorée (plan Free ou extension désactivée).';
    RETURN;
  END IF;

  -- Récupérer l'ID du job existant
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'refresh-materialized-views-hc';

  IF v_job_id IS NULL THEN
    RAISE NOTICE 'Job ''refresh-materialized-views-hc'' introuvable — création avec la nouvelle fréquence.';
    PERFORM cron.schedule(
      'refresh-materialized-views-hc',
      '*/5 * * * *',
      $job$SELECT refresh_all_materialized_views('cron')$job$
    );
  ELSE
    RAISE NOTICE 'Job ''refresh-materialized-views-hc'' trouvé (id=%) — passage à */5 * * * *.', v_job_id;
    PERFORM cron.alter_job(
      job_id   := v_job_id,
      schedule := '*/5 * * * *'
    );
  END IF;
END
$$;
