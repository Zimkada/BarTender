-- ===================================================================
-- DIAGNOSTIC — Jobs pg_cron de refresh (cause de l'alerte Disk IO)
-- DATE : 2026-09-10
-- ===================================================================
--
-- ⚠️ LECTURE SEULE. Exécutable pendant le service.
--
-- POURQUOI CE RELEVÉ : le bloc 2 du diagnostic Disk IO a montré
-- 12 476 exécutions de refresh_all_materialized_views pour 26 903 s
-- de CPU — soit plus de 4x le coût de create_sale.
--
-- La migration 20260607160000 devait pourtant normaliser tout cela :
-- UN SEUL job à */30, doublon supprimé, vue morte retirée. Les chiffres
-- disent que ce n'est plus l'état réel.
--
-- ⭐ Leçon projet appliquée : on ne corrige rien avant d'avoir relevé
--    l'état RÉEL en base. Les fichiers ont déjà menti ici.
-- ===================================================================


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BLOC A — TOUS LES JOBS CRON ACTIFS                              │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ATTENDU d'après la migration du 07/06 : UN SEUL job de refresh,
-- schedule '*/30 * * * *'.
--
-- À SURVEILLER :
--   - plusieurs jobs appelant refresh_all_materialized_views
--   - un schedule '*/5' ou '0 * * * *' encore en place
--   - des jobs actifs oubliés (active = true)

SELECT
    jobid,
    jobname,
    schedule,
    active,
    LEFT(command, 120) AS commande
FROM cron.job
ORDER BY jobname;


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BLOC B — FRÉQUENCE RÉELLE D'EXÉCUTION (24 dernières heures)     │
-- └─────────────────────────────────────────────────────────────────┘
--
-- C'est le bloc qui tranche : il compte les exécutions RÉELLES,
-- indépendamment de ce que le schedule prétend.
--
-- LECTURE :
--   ~48 executions/24h  -> */30, conforme
--   ~288 executions/24h -> */5, la correction de juin n'est plus active
--   ~576 executions/24h -> DEUX jobs à */5 en parallèle

SELECT
    j.jobname,
    j.schedule,
    COUNT(*)                                   AS executions_24h,
    ROUND(AVG(EXTRACT(EPOCH FROM (d.end_time - d.start_time)))::numeric, 2)
                                               AS duree_moyenne_s,
    ROUND(SUM(EXTRACT(EPOCH FROM (d.end_time - d.start_time)))::numeric, 1)
                                               AS cpu_total_24h_s,
    MIN(d.start_time)                          AS premiere,
    MAX(d.start_time)                          AS derniere
FROM cron.job_run_details d
JOIN cron.job j ON j.jobid = d.jobid
WHERE d.start_time > now() - interval '24 hours'
GROUP BY j.jobname, j.schedule
ORDER BY cpu_total_24h_s DESC NULLS LAST;


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BLOC C — QUI DÉCLENCHE LES REFRESH ?                            │
-- └─────────────────────────────────────────────────────────────────┘
--
-- Le bloc 2 montrait TROIS signatures de refresh distinctes, dont deux
-- passant par PostgREST (donc appelées par l'APPLICATION, pas par cron).
-- Ce bloc identifie la répartition réelle des déclencheurs.
--
-- LECTURE : si 'cron' ne domine pas, l'application déclenche elle-même
-- des refresh — piste : useCacheWarming / useViewMonitoring côté front.

SELECT
    triggered_by,
    COUNT(*)                                        AS nb_refresh,
    MIN(created_at)                                 AS premier,
    MAX(created_at)                                 AS dernier,
    COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours')
                                                    AS dont_24h
FROM materialized_view_refresh_log
GROUP BY triggered_by
ORDER BY nb_refresh DESC;


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BLOC D — QUELLES VUES SONT RAFRAÎCHIES, ET À QUEL COÛT          │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ATTENDU : 5 vues (top_products_by_period a été retirée le 07/06 comme
-- VUE MORTE). Le bloc 5 du diagnostic precedent montre pourtant
-- top_products_by_period_mat avec 45 568 scans et son index jamais
-- utilise -> a confirmer ici.

SELECT
    view_name,
    COUNT(*)                                        AS nb_refresh,
    ROUND(AVG(duration_ms)::numeric, 1)             AS duree_moyenne_ms,
    ROUND(SUM(duration_ms)::numeric / 1000, 1)      AS duree_totale_s,
    COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours')
                                                    AS dont_24h,
    MAX(created_at)                                 AS dernier_refresh
FROM materialized_view_refresh_log
GROUP BY view_name
ORDER BY duree_totale_s DESC NULLS LAST;


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BLOC E — TAILLE DU LOG DE REFRESH (auto-alimenté)               │
-- └─────────────────────────────────────────────────────────────────┘
--
-- materialized_view_refresh_log pèse 11 MB pour 10 093 lignes, avec
-- 7,7 MB d'index — et il grossit à chaque refresh. Ce log est
-- lui-meme une source d'ecriture disque.
--
-- LECTURE : si les lignes s'accumulent sans purge, prevoir une
-- retention (ex. 30 jours).

SELECT
    COUNT(*)                                        AS lignes_totales,
    MIN(created_at)                                 AS plus_ancienne,
    MAX(created_at)                                 AS plus_recente,
    COUNT(*) FILTER (WHERE created_at < now() - interval '30 days')
                                                    AS plus_de_30_jours,
    pg_size_pretty(pg_total_relation_size('materialized_view_refresh_log'))
                                                    AS taille
FROM materialized_view_refresh_log;
