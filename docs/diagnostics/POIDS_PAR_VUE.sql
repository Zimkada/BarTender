-- ===================================================================
-- POIDS RÉEL DE CHAQUE VUE DANS LE CRON
-- DATE : 2026-09-14
-- ===================================================================
--
-- ⚠️ LECTURE SEULE. Exécutable pendant le service.
--
-- POURQUOI : le bloc A du 14/09 a montré que le cron pèse 240
-- refresh/jour, contre 42-95 pour post_mutation. Le cron est donc le
-- poste DOMINANT — 2,5 à 5 fois plus lourd que ce qu'on s'apprêtait à
-- corriger.
--
-- Ces 240 = 5 vues x 48 exécutions (job */30 unique appelant
-- refresh_all_materialized_views, qui boucle sur les 5 vues).
--
-- Mais les 5 vues ne coûtent PAS la même chose. Relevé du 10/09 :
--   daily_sales_summary ..... 1663 ms de moyenne
--   product_sales_stats ..... 1581 ms
--   bar_ancillary_stats .....  177 ms
--   expenses_summary ........  142 ms
--   bar_stats_multi_period ...  81 ms
--
-- => Deux vues portent ~95 % du coût. Retirer les trois autres ne
--    servirait quasiment à rien.
--
-- Ce fichier confirme ces chiffres sur la période récente et permet de
-- décider QUELLE vue attaquer en priorité.
-- ===================================================================


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BLOC 1 — COÛT PAR VUE SUR 7 JOURS (le classement qui décide)    │
-- └─────────────────────────────────────────────────────────────────┘
--
-- LECTURE : la colonne cpu_total_s dit où va réellement le temps.
-- C'est elle qui doit guider l'effort, pas le nombre de refresh.

SELECT
    view_name                                           AS vue,
    COUNT(*)                                            AS nb_refresh,
    ROUND(AVG(duration_ms)::numeric, 0)                 AS duree_moyenne_ms,
    ROUND(SUM(duration_ms)::numeric / 1000, 1)          AS cpu_total_s,
    ROUND(100.0 * SUM(duration_ms)
          / NULLIF(SUM(SUM(duration_ms)) OVER (), 0), 1) AS pct_du_cout_total,
    COUNT(*) FILTER (WHERE triggered_by = 'cron')       AS via_cron,
    COUNT(*) FILTER (WHERE triggered_by = 'post_mutation') AS via_post_mutation
FROM materialized_view_refresh_log
WHERE created_at > now() - interval '7 days'
GROUP BY view_name
ORDER BY cpu_total_s DESC;


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BLOC 2 — VUES MORTES : confirmation côté base                   │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ⭐ ANALYSE CODE DU 14/09 (à confirmer par ce bloc) :
--
--   bar_stats_multi_period  -> consommée UNIQUEMENT par BarStatsModal,
--                              lui-même monté uniquement par
--                              BarStatsPage... qui n'est référencée
--                              NULLE PART (ni route, ni import).
--                              AnalyticsService.getBarStatsMultiPeriod
--                              n'a AUCUN appelant.
--                              => vue morte probable
--
--   bar_ancillary_stats     -> même chaîne : BarStatsModal seul.
--                              => vue morte probable
--
--   product_sales_stats     -> ForecastingService -> OrderPreparation
--                              -> PurchaseOrdersTab -> InventoryPage.
--                              VIVANTE, mais consultée lors des
--                              commandes fournisseurs, pas en service.
--
--   expenses_summary        -> AnalyticsService, page Comptabilité.
--                              VIVANTE, consultation ponctuelle.
--
--   daily_sales_summary     -> getRevenueSummary -> useSalesStats ->
--                              Historique des ventes. VIVANTE et
--                              consultée EN SERVICE (source de vérité
--                              du CA).
--
-- Ce bloc vérifie si les deux vues supposées mortes sont réellement
-- lues en base — indépendamment de ce que dit le code.
--
-- LECTURE : idx_scan et seq_scan proches de 0 sur une longue période
-- confirmeraient qu'elles ne sont jamais interrogées.
--
-- ⚠️ stats_reset (dernière colonne) est décisif : si les statistiques
--    ont été remises à zéro récemment, ces chiffres ne prouvent RIEN.

SELECT
    relname                                             AS vue_mat,
    seq_scan                                            AS scans_complets,
    idx_scan                                            AS scans_index,
    COALESCE(seq_scan, 0) + COALESCE(idx_scan, 0)       AS lectures_totales,
    pg_size_pretty(pg_total_relation_size(relid))       AS taille,
    (SELECT stats_reset FROM pg_stat_database
      WHERE datname = current_database())               AS stats_depuis
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND relname IN (
      'daily_sales_summary_mat',
      'product_sales_stats_mat',
      'expenses_summary_mat',
      'bar_stats_multi_period_mat',
      'bar_ancillary_stats_mat'
  )
ORDER BY lectures_totales ASC;


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BLOC 3 — GAIN SIMULÉ SELON LE SCÉNARIO                          │
-- └─────────────────────────────────────────────────────────────────┘
--
-- Chiffre ce que chaque option rapporterait RÉELLEMENT, sur la base
-- des 7 derniers jours. Évite de s'engager dans un chantier lourd pour
-- un gain marginal.
--
-- LECTURE :
--   • "retirer les 2 vues mortes"        -> gain si elles sont bien mortes
--   • "retirer daily_sales_summary"      -> exige la migration de
--                                            getRevenueSummary (chantier)
--   • "verrou serveur post_mutation"     -> ne touche QUE post_mutation

SELECT
    'Total actuel (7j)'                                 AS scenario,
    ROUND(SUM(duration_ms)::numeric / 1000, 1)          AS cpu_s,
    100.0                                               AS pct_restant
FROM materialized_view_refresh_log
WHERE created_at > now() - interval '7 days'

UNION ALL

SELECT
    'Si on retire les 2 vues mortes (bar_stats + ancillary)',
    ROUND(SUM(duration_ms) FILTER (
        WHERE view_name NOT IN ('bar_stats_multi_period','bar_ancillary_stats')
    )::numeric / 1000, 1),
    ROUND(100.0 * SUM(duration_ms) FILTER (
        WHERE view_name NOT IN ('bar_stats_multi_period','bar_ancillary_stats')
    ) / NULLIF(SUM(duration_ms), 0), 1)
FROM materialized_view_refresh_log
WHERE created_at > now() - interval '7 days'

UNION ALL

SELECT
    'Si on retire AUSSI daily_sales_summary (migration getRevenueSummary)',
    ROUND(SUM(duration_ms) FILTER (
        WHERE view_name NOT IN ('bar_stats_multi_period','bar_ancillary_stats',
                                'daily_sales_summary')
    )::numeric / 1000, 1),
    ROUND(100.0 * SUM(duration_ms) FILTER (
        WHERE view_name NOT IN ('bar_stats_multi_period','bar_ancillary_stats',
                                'daily_sales_summary')
    ) / NULLIF(SUM(duration_ms), 0), 1)
FROM materialized_view_refresh_log
WHERE created_at > now() - interval '7 days'

UNION ALL

SELECT
    'Verrou serveur seul (supprime post_mutation, cron inchange)',
    ROUND(SUM(duration_ms) FILTER (WHERE triggered_by <> 'post_mutation')::numeric / 1000, 1),
    ROUND(100.0 * SUM(duration_ms) FILTER (WHERE triggered_by <> 'post_mutation')
          / NULLIF(SUM(duration_ms), 0), 1)
FROM materialized_view_refresh_log
WHERE created_at > now() - interval '7 days';
