-- MIGRATION: Optimisation du refresh des vues matérialisées (Compute Hours)
-- DATE: 2026-06-07
-- AUTHOR: BarTender

-- PROBLEM: Le refresh des vues matérialisées consomme ~874 s/jour de CPU (mesuré,
--   2 bars), en CONCURRENTLY (CPU-intensif). Deux causes :
--
--   1. DOUBLON DE JOBS CRON. L'historique des migrations révèle DEUX jobs pg_cron
--      appelant refresh_all_materialized_views('cron') :
--      - 'refresh-materialized-views-hourly' : créé le 2025-12-18 (schedule 0 * * * *)
--      - 'refresh-materialized-views-hc'     : créé le 2026-05-17 (schedule */5 * * * *)
--      La migration du 17 mai cherchait '-hc' (inexistant à l'époque) et l'a créé
--      SANS supprimer '-hourly' → les deux tournent en parallèle en prod.
--
--   2. FRÉQUENCE EXCESSIVE. Aucune vue n'alimente une fonctionnalité exigeant une
--      fraîcheur 5 min :
--      - Dashboard temps réel → lit les tables brutes via les pivots (pas les vues)
--      - daily_sales_summary → déjà rafraîchie après chaque vente (post_mutation
--        dans useSalesMutations) → le cron fait double emploi
--      - top_products_by_period → VUE MORTE : aucune lecture applicative. Le dashboard
--        "top produits" passe par la RPC get_top_products_aggregated qui lit
--        FROM public.sales (tables brutes), jamais cette vue. ~214 s/jour gaspillées.
--      - product_sales_stats / bar_stats / expenses_summary → analytique/prévision/
--        compta consultées ponctuellement (fraîcheur 30 min largement suffisante).

-- IMPACT: Aucun utilisateur. Optimisation infrastructure (Compute Hours) uniquement.

-- SOLUTION:
--   ACTION 1 — Retirer top_products_by_period de refresh_all_materialized_views
--              (vue morte, certifiée non lue).
--   ACTION 2 — Normaliser le cron : supprimer TOUS les jobs de refresh existants
--              (quel que soit leur nom) puis (re)créer UN SEUL job canonique à */30.
--              Élimine le doublon -hourly/-hc et passe de */5 à */30.
--              CONCURRENTLY conservé (protection anti-lock de l'incident PGRST003
--              du 18 mai 2026). Moins de refreshs = moins de risque de saturation.
--   daily_sales_summary RESTE dans le cron comme filet (couvre le cas d'une vente
--   passée sans déclencher le refresh post-mutation, ex: sync offline).

-- BREAKING_CHANGE: NO
-- RLS_CHANGES: none
-- IDEMPOTENT: OUI — réexécutable sans effet de bord (supprime puis recrée un job unique).
-- NOTE FRONTEND: EXPECTED_VIEWS dans src/hooks/useViewMonitoring.ts mis à jour en
--   parallèle (retrait de 'top_products_by_period') pour éviter que useCacheWarming
--   ne déclenche un refresh complet à chaque démarrage (vue absente du log → "missing").

BEGIN;

-- =====================================================
-- ACTION 1 : Retirer top_products_by_period de la liste de refresh
-- =====================================================
-- Structure strictement identique à 20260518000002 (boucle FOR + logger + fix
-- ambiguïté status), seule la liste des vues change (6 → 5).

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
      -- 'top_products_by_period' retiré (vue morte : aucune lecture applicative,
      --   le dashboard top produits passe par la RPC get_top_products_aggregated
      --   qui lit les tables brutes). Cf. migration 20260607160000.
      'bar_stats_multi_period',
      'bar_ancillary_stats'
    ]) AS name
  LOOP
    BEGIN
      v_log_id := refresh_materialized_view_with_logging(v_view.name, p_triggered_by);

      -- Fix ambiguïté : préfixer 'status' par l'alias de table (sinon erreur 42702
      -- 'column reference "status" is ambiguous' catchée silencieusement → faux 'failed').
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
'Rafraîchit les 5 vues matérialisées réellement utilisées et retourne le status de
chacune. top_products_by_period retiré le 2026-06-07 (vue morte, dashboard via RPC).';

-- =====================================================
-- ACTION 2 : Normaliser le(s) job(s) cron → un seul job à */30
-- =====================================================
-- Robuste à l'état réel de la prod : on ne suppose AUCUN nom de job. On supprime
-- tous les jobs qui appellent refresh_all_materialized_views (gère le doublon
-- -hourly/-hc), puis on (re)crée un unique job canonique.

DO $$
DECLARE
  v_jobnames TEXT[];
  v_jobname  TEXT;
  v_count    INT := 0;
BEGIN
  -- Guard : pg_cron absent (dev sans extension) → ne rien faire, sans erreur.
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron non disponible — normalisation du cron ignorée.';
    RETURN;
  END IF;

  -- 1. Collecter d'abord (snapshot dans un array) les noms de TOUS les jobs
  --    appelant refresh_all_materialized_views, identifiés par leur 'command'.
  --    Robuste : ne suppose aucun nom précis, gère le doublon -hourly/-hc.
  --    Matérialisation explicite avant suppression pour ne pas itérer sur cron.job
  --    pendant qu'on le modifie.
  SELECT array_agg(jobname)
  INTO v_jobnames
  FROM cron.job
  WHERE command ILIKE '%refresh_all_materialized_views%'
    AND jobname IS NOT NULL;

  -- 2. Supprimer chaque job collecté (unschedule PAR NOM : signature text, la
  --    seule utilisée en prod et garantie disponible).
  IF v_jobnames IS NOT NULL THEN
    FOREACH v_jobname IN ARRAY v_jobnames LOOP
      PERFORM cron.unschedule(v_jobname);
      v_count := v_count + 1;
      RAISE NOTICE 'Job cron supprimé : %', v_jobname;
    END LOOP;
  END IF;

  RAISE NOTICE '% job(s) de refresh supprimé(s).', v_count;

  -- 3. (Re)créer UN SEUL job canonique à */30 minutes.
  --    cron.schedule fait un upsert sur le nom, donc sûr même si l'étape 2 n'a
  --    rien supprimé (ex: premier déploiement).
  PERFORM cron.schedule(
    'refresh-materialized-views-hc',
    '*/30 * * * *',
    $job$SELECT refresh_all_materialized_views('cron')$job$
  );
  RAISE NOTICE 'Job unique ''refresh-materialized-views-hc'' (re)créé à */30 * * * *.';
END
$$;

COMMIT;
