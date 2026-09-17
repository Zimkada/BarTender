-- ===================================================================
-- PARITÉ — daily_sales_summary vs tables brutes (business_date)
-- DATE : 2026-09-14
-- ===================================================================
--
-- ⚠️ LECTURE SEULE. Exécutable pendant le service.
--
-- OBJECTIF : décider si getRevenueSummary peut être migré vers les
-- tables brutes (comme AccountingOverview l'a fait avec useRevenueStats).
-- Gain mesuré si oui : 84 % du coût de refresh (bloc 3 du 14/09).
--
-- ⭐ DIVERGENCE SUSPECTÉE, ET C'EST LE POINT CENTRAL DE CE FICHIER :
--
--   La vue matérialisée calcule sa date ainsi (migration 058) :
--       DATE(s.created_at - INTERVAL '6 hours')   <- 6h EN DUR
--
--   Le trigger calculate_business_date (migration 067) calcule ainsi :
--       SELECT closing_hour FROM bars WHERE id = NEW.bar_id
--       NEW.business_date := DATE(created_at - closing_hour heures)
--                                              ^^^^^^^^^^^^ PAR BAR
--
--   => Si un seul bar a closing_hour <> 6, la vue et business_date
--      rangent ses ventes dans des journées DIFFÉRENTES.
--
--   Conséquence : l'Historique des ventes (qui lit la vue) et la
--   Comptabilité (qui lit business_date) afficheraient des CA
--   différents pour ce bar. Migrer corrigerait alors un BUG EXISTANT,
--   au lieu d'en introduire un.
-- ===================================================================


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BLOC 1 — LES BARS ONT-ILS TOUS closing_hour = 6 ?               │
-- └─────────────────────────────────────────────────────────────────┘
--
-- C'est LE bloc qui décide. Il est le plus court et le plus important.
--
-- LECTURE :
--   • Tous à 6 (ou NULL, qui vaut 6 par défaut dans le trigger)
--       -> aucune divergence, la migration est une simple substitution.
--   • Au moins un bar à une autre valeur
--       -> la vue est DÉJÀ fausse pour ce bar, et la migration corrige
--          un bug au passage. À signaler comme tel, pas comme un risque.

SELECT
    closing_hour,
    COUNT(*)                                        AS nb_bars,
    STRING_AGG(name, ', ' ORDER BY name)            AS bars_concernes,
    CASE
        WHEN closing_hour IS NULL THEN 'NULL -> 6 par defaut (trigger) : OK'
        WHEN closing_hour = 6     THEN 'aligne sur la vue : OK'
        ELSE '⚠️ DIVERGE de la vue (codee a 6h en dur)'
    END                                             AS statut
FROM bars
WHERE is_active = true
GROUP BY closing_hour
ORDER BY closing_hour NULLS FIRST;


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BLOC 2 — ÉCART CHIFFRÉ ENTRE LES DEUX SOURCES (30 derniers jours)│
-- └─────────────────────────────────────────────────────────────────┘
--
-- Compare, journée par journée et bar par bar, ce que dit la vue
-- matérialisée et ce que disent les tables brutes via business_date.
--
-- ⭐ C'est la preuve empirique, indépendante du bloc 1 : même si tous
--    les bars sont à 6h, un écart ici révélerait autre chose (retours
--    comptés différemment, ventes hors périmètre, vue périmée).
--
-- LECTURE :
--   • ecart_ca = 0 partout -> parité parfaite, migration sans risque
--   • ecart_ca <> 0 ponctuel sur le jour courant -> NORMAL : la vue a
--     jusqu'a 30 min de retard (cron */30). Ne pas s'en alarmer.
--   • ecart_ca <> 0 sur des jours PASSÉS -> divergence structurelle,
--     à comprendre AVANT de migrer.

WITH depuis_la_vue AS (
    SELECT
        bar_id,
        sale_date                                   AS journee,
        SUM(gross_revenue)                          AS ca_brut_vue,
        SUM(net_revenue)                            AS ca_net_vue,
        SUM(validated_count)                        AS nb_ventes_vue
    FROM daily_sales_summary_mat
    WHERE sale_date > CURRENT_DATE - 30
    GROUP BY bar_id, sale_date
),
depuis_les_tables AS (
    SELECT
        bar_id,
        business_date                               AS journee,
        SUM(total)                                  AS ca_brut_table,
        COUNT(*)                                    AS nb_ventes_table
    FROM sales
    WHERE business_date > CURRENT_DATE - 30
      AND status = 'validated'
    GROUP BY bar_id, business_date
)
SELECT
    COALESCE(v.journee, t.journee)                  AS journee,
    COALESCE(v.bar_id, t.bar_id)                    AS bar_id,
    v.ca_brut_vue,
    t.ca_brut_table,
    COALESCE(t.ca_brut_table, 0) - COALESCE(v.ca_brut_vue, 0)   AS ecart_ca,
    v.nb_ventes_vue,
    t.nb_ventes_table,
    COALESCE(t.nb_ventes_table, 0) - COALESCE(v.nb_ventes_vue, 0) AS ecart_nb_ventes,
    CASE
        WHEN COALESCE(v.journee, t.journee) >= CURRENT_DATE - 1
            THEN 'jour recent - un ecart est ATTENDU (cron */30)'
        WHEN COALESCE(t.ca_brut_table, 0) = COALESCE(v.ca_brut_vue, 0)
            THEN 'identique'
        ELSE '⚠️ ECART SUR JOUR PASSE - a comprendre avant migration'
    END                                             AS interpretation
FROM depuis_la_vue v
FULL OUTER JOIN depuis_les_tables t
       ON v.bar_id = t.bar_id AND v.journee = t.journee
WHERE COALESCE(t.ca_brut_table, 0) <> COALESCE(v.ca_brut_vue, 0)
ORDER BY journee DESC, bar_id
LIMIT 50;

-- Si ce bloc ne renvoie AUCUNE ligne : parité parfaite sur 30 jours.
-- C'est le meilleur résultat possible.


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BLOC 3 — RÉSUMÉ DE L'ÉCART (une ligne, pour trancher vite)      │
-- └─────────────────────────────────────────────────────────────────┘
--
-- Le bloc 2 peut renvoyer beaucoup de lignes. Celui-ci résume.
--
-- LECTURE : jours_divergents_hors_recents est le seul chiffre qui
-- compte. S'il vaut 0, la migration est sûre.

WITH depuis_la_vue AS (
    SELECT bar_id, sale_date AS journee, SUM(gross_revenue) AS ca
    FROM daily_sales_summary_mat
    WHERE sale_date > CURRENT_DATE - 30
    GROUP BY bar_id, sale_date
),
depuis_les_tables AS (
    SELECT bar_id, business_date AS journee, SUM(total) AS ca
    FROM sales
    WHERE business_date > CURRENT_DATE - 30 AND status = 'validated'
    GROUP BY bar_id, business_date
)
SELECT
    COUNT(*)                                                    AS couples_bar_jour_compares,
    COUNT(*) FILTER (
        WHERE COALESCE(t.ca, 0) <> COALESCE(v.ca, 0)
    )                                                           AS jours_divergents_total,
    COUNT(*) FILTER (
        WHERE COALESCE(t.ca, 0) <> COALESCE(v.ca, 0)
          AND COALESCE(v.journee, t.journee) < CURRENT_DATE - 1
    )                                                           AS jours_divergents_hors_recents,
    ROUND(SUM(ABS(COALESCE(t.ca, 0) - COALESCE(v.ca, 0)))::numeric, 0) AS ecart_cumule_xof
FROM depuis_la_vue v
FULL OUTER JOIN depuis_les_tables t
       ON v.bar_id = t.bar_id AND v.journee = t.journee;


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BLOC 4 — RETOURS : la vue les compte-t-elle comme useRevenueStats ?│
-- └─────────────────────────────────────────────────────────────────┘
--
-- La vue calcule net_revenue = ventes validees - retours APPROUVES,
-- en joignant returns sur le meme business day.
--
-- useRevenueStats calcule netRevenue = grossRevenue - refundsTotal,
-- ou refundsTotal vient de useUnifiedReturns.
--
-- Ce bloc verifie que les retours sont ranges dans les memes journees
-- des deux cotes. Un ecart ici toucherait le CA NET, pas le brut.

SELECT
    r.business_date                                 AS journee,
    r.bar_id,
    COUNT(*) FILTER (WHERE r.status = 'approved')   AS retours_approuves,
    COALESCE(SUM(r.refund_amount) FILTER (WHERE r.status = 'approved'), 0) AS montant_rembourse,
    (SELECT COALESCE(SUM(total_refunded), 0)
       FROM daily_sales_summary_mat m
      WHERE m.bar_id = r.bar_id
        AND m.sale_date = r.business_date)          AS montant_selon_la_vue
FROM returns r
WHERE r.business_date > CURRENT_DATE - 30
GROUP BY r.business_date, r.bar_id
HAVING COALESCE(SUM(r.refund_amount) FILTER (WHERE r.status = 'approved'), 0)
     <> (SELECT COALESCE(SUM(total_refunded), 0)
           FROM daily_sales_summary_mat m
          WHERE m.bar_id = r.bar_id AND m.sale_date = r.business_date)
ORDER BY journee DESC
LIMIT 20;

-- Aucune ligne = les retours concordent. C'est l'attendu.
