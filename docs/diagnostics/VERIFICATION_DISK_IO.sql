-- ===================================================================
-- VÉRIFICATION — Effet du débounce sur le Disk IO
-- DATE : 2026-09-14
-- ===================================================================
--
-- ⚠️ LECTURE SEULE. Exécutable pendant le service.
--
-- CONTEXTE : le débounce du refresh de daily_sales_summary (c78be5b)
-- est en production depuis le 2026-09-11 01:18 UTC (confirmé par
-- bartenderpro-africa.com/version.json). Refresh plafonné à un par
-- minute et par bar, au lieu d'un par vente.
--
-- ⭐ PIÈGE MÉTHODOLOGIQUE À CONNAÎTRE AVANT DE LIRE LES RÉSULTATS :
--
--    pg_stat_statements CUMULE depuis le dernier reset. Les 2 475
--    refresh relevés le 10/09 sont donc INCLUS dans les totaux
--    d'aujourd'hui. Comparer les totaux bruts du bloc 2 au relevé du 10
--    ne prouverait RIEN — les chiffres ne peuvent qu'augmenter.
--
--    => Le bloc A ci-dessous est LE bloc qui tranche : il utilise
--       materialized_view_refresh_log, qui horodate CHAQUE refresh et
--       permet donc de comparer avant / après le déploiement.
-- ===================================================================


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BLOC A — LE VERDICT : refresh par jour, avant vs après          │
-- └─────────────────────────────────────────────────────────────────┘
--
-- C'est le seul bloc qui mesure directement l'effet du débounce.
--
-- LECTURE :
--   • Colonne post_mutation : c'est ELLE qui doit avoir chuté.
--     Référence avant correctif : ~76 par 24 h (relevé du 10/09).
--     Attendu après : nettement moins, plafonné par le rythme des
--     ventes et la fenêtre d'une minute par bar.
--   • Colonne cron : doit rester à ~48/jour (job */30). Si elle bouge,
--     c'est autre chose qui a changé.
--   • Les lignes du 11/09 sont À CHEVAL sur le déploiement (01h18) :
--     les lire avec prudence, la journée mélange les deux régimes.

SELECT
    DATE(created_at)                                              AS jour,
    COUNT(*) FILTER (WHERE triggered_by = 'post_mutation')        AS post_mutation,
    COUNT(*) FILTER (WHERE triggered_by = 'cron')                 AS cron,
    COUNT(*) FILTER (WHERE triggered_by = 'app_startup')          AS app_startup,
    COUNT(*) FILTER (WHERE triggered_by NOT IN
        ('post_mutation','cron','app_startup'))                   AS autres,
    COUNT(*)                                                      AS total,
    ROUND(SUM(duration_ms)::numeric / 1000, 1)                    AS cpu_total_s,
    CASE
        WHEN DATE(created_at) <  DATE '2026-09-11' THEN 'avant débounce'
        WHEN DATE(created_at) =  DATE '2026-09-11' THEN '⚠️ jour du déploiement (01h18)'
        ELSE 'après débounce'
    END                                                           AS regime
FROM materialized_view_refresh_log
WHERE created_at > now() - interval '14 days'
GROUP BY DATE(created_at)
ORDER BY jour DESC;


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BLOC B — MOYENNE AVANT / APRÈS, EN UNE LIGNE CHACUNE            │
-- └─────────────────────────────────────────────────────────────────┘
--
-- Même donnée que le bloc A, résumée. Le 11/09 est EXCLU des deux
-- périodes : journée à cheval sur le déploiement, elle fausserait la
-- comparaison dans un sens comme dans l'autre.
--
-- LECTURE : comparer refresh_post_mutation_par_jour entre les deux
-- lignes. C'est le facteur de gain réel.
--
-- ⚠️ Cette mesure dépend du VOLUME DE VENTES de chaque période. Une
--    baisse d'activité produirait le même signal qu'un débounce
--    efficace. Le bloc C contrôle ce biais.

SELECT
    periode,
    jours_observes,
    refresh_post_mutation,
    ROUND(refresh_post_mutation::numeric / NULLIF(jours_observes, 0), 1)
        AS refresh_post_mutation_par_jour,
    ROUND(cpu_s::numeric / NULLIF(jours_observes, 0), 1)
        AS cpu_s_par_jour
FROM (
    SELECT
        CASE WHEN created_at < TIMESTAMPTZ '2026-09-11 01:18:00+00'
             THEN '1. avant débounce' ELSE '2. après débounce' END AS periode,
        COUNT(DISTINCT DATE(created_at))                           AS jours_observes,
        COUNT(*) FILTER (WHERE triggered_by = 'post_mutation')     AS refresh_post_mutation,
        SUM(duration_ms) FILTER (WHERE triggered_by = 'post_mutation') / 1000.0 AS cpu_s
    FROM materialized_view_refresh_log
    WHERE created_at > now() - interval '14 days'
      AND DATE(created_at) <> DATE '2026-09-11'   -- journée à cheval, exclue
    GROUP BY 1
) t
ORDER BY periode;


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BLOC C — CONTRÔLE DU BIAIS : le volume de ventes a-t-il bougé ? │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ⭐ Sans ce bloc, les blocs A et B ne prouvent rien. Moins de ventes
--    produirait moins de refresh, débounce ou pas.
--
-- LECTURE : le ratio refresh / vente est la VRAIE mesure du débounce,
-- car il neutralise l'activité.
--   Avant : proche de 1 refresh par vente validée (un par mutation).
--   Après : doit être nettement inférieur à 1.
--
-- ⚠️ business_date, pas created_at : la journée comptable va au-delà de
--    minuit (les ventes de 2 h du matin appartiennent à la veille).

SELECT
    s.business_date                                     AS journee_comptable,
    COUNT(*)                                            AS ventes_validees,
    (SELECT COUNT(*)
       FROM materialized_view_refresh_log m
      WHERE m.triggered_by = 'post_mutation'
        AND DATE(m.created_at) = s.business_date)       AS refresh_post_mutation,
    ROUND(
        (SELECT COUNT(*)
           FROM materialized_view_refresh_log m
          WHERE m.triggered_by = 'post_mutation'
            AND DATE(m.created_at) = s.business_date)::numeric
        / NULLIF(COUNT(*), 0), 2)                       AS refresh_par_vente,
    CASE WHEN s.business_date < DATE '2026-09-11'
         THEN 'avant' ELSE 'après' END                  AS regime
FROM sales s
WHERE s.business_date > CURRENT_DATE - 14
  AND s.status = 'validated'
GROUP BY s.business_date
ORDER BY s.business_date DESC;


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BLOC D — ÉTAT ACTUEL DU CACHE ET DES I/O GLOBAUX                │
-- └─────────────────────────────────────────────────────────────────┘
--
-- Référence du 10/09 : cache global 100,00 %, 13 195 blocs lus disque
-- contre 2,86 Md en RAM. La base tenait entièrement en mémoire.
--
-- LECTURE : si le cache reste à ~100 %, le problème n'a jamais été la
-- LECTURE disque — ce que le diagnostic du 10 avait établi. Cela
-- confirmerait que l'alerte portait bien sur les ÉCRITURES.

SELECT
    SUM(blks_read)                                      AS blocs_lus_disque,
    SUM(blks_hit)                                       AS blocs_lus_cache,
    ROUND(100.0 * SUM(blks_hit)
          / NULLIF(SUM(blks_hit) + SUM(blks_read), 0), 2) AS pct_cache_global,
    (SELECT stats_reset FROM pg_stat_database
      WHERE datname = current_database())               AS stats_depuis
FROM pg_stat_database
WHERE datname = current_database();


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BLOC E — TOP REQUÊTES (cumulé, à lire avec la mise en garde)    │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ⚠️ RAPPEL : ces chiffres CUMULENT depuis stats_depuis (bloc D). Ils
--    incluent la période d'avant le correctif. Ne PAS les comparer aux
--    totaux du 10/09 pour conclure — ils ne peuvent qu'augmenter.
--
-- Ce bloc sert à deux choses seulement :
--   1. Voir si un NOUVEAU poste a émergé (une requête absente du
--      relevé du 10 et qui apparaît haut aujourd'hui).
--   2. Comparer les temps MOYENS (mean_exec_time), qui eux ne sont pas
--      cumulatifs et restent donc comparables.
--
-- Référence du 10/09, temps moyens :
--   refresh_all_materialized_views ....... 2156,4 ms
--   RPC refresh (PostgREST) .............. 1040,0 ms / 1619,1 ms
--   create_sale .......................... 547,7 ms

SELECT
    LEFT(query, 150)                                   AS requete,
    calls                                              AS appels,
    ROUND(total_exec_time::numeric / 1000, 1)          AS temps_total_s,
    ROUND(mean_exec_time::numeric, 1)                  AS temps_moyen_ms,
    shared_blks_read                                   AS blocs_lus_disque,
    shared_blks_written                                AS blocs_ECRITS,
    shared_blks_dirtied                                AS blocs_salis
FROM pg_stat_statements
WHERE query NOT ILIKE '%pg_stat%'
ORDER BY shared_blks_dirtied DESC
LIMIT 20;

-- NOTE sur le bloc E : le tri porte sur shared_blks_dirtied (blocs
-- SALIS = modifiés, donc à réécrire sur disque), et non plus sur
-- shared_blks_read comme le 10/09. C'est délibéré : le diagnostic a
-- établi que le problème était les ÉCRITURES, pas les lectures. Trier
-- par lectures, comme je l'avais fait initialement, regardait le
-- mauvais indicateur.
