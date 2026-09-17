-- ============================================================
-- Audit des triggers de refresh sur vues matérialisées analytiques
-- Contexte : après la correction du 16-17/09/2026 sur daily_sales_summary
-- (trigger post_mutation supprimé), vérifier si le MEME pattern existe
-- encore sur les autres vues (product_sales_stats, expenses_summary,
-- salaries_summary) qui avaient reçu un "debounce" en 057/226/227 au
-- lieu d'une suppression.
--
-- ⚠️ Les fichiers de migration ne reflètent PAS toujours l'état réel
-- de la base (CREATE OR REPLACE FUNCTION successifs, DROP TRIGGER
-- oubliés ou appliqués hors migration). Cette requête interroge l'état
-- RÉEL, pas les fichiers.
-- ============================================================

-- 1. Lister tous les triggers actifs sur la table `sales`, `expenses`,
--    `salaries` qui appellent une fonction de refresh de vue matérialisée
SELECT
    event_object_table AS table_source,
    trigger_name,
    action_timing,
    event_manipulation,
    action_statement
FROM information_schema.triggers
WHERE event_object_table IN ('sales', 'expenses', 'salaries', 'returns', 'supplies')
  AND trigger_name ILIKE '%refresh%'
ORDER BY event_object_table, trigger_name;

-- 2. Pour chaque vue matérialisée, vérifier depuis quand elle a été
--    rafraîchie et à quelle fréquence (sur les 7 derniers jours)
--    → si le compteur "trigger" ou "pg_notify" est élevé, le pattern
--    couplage-événement-fréquent est probablement encore actif
SELECT
    view_name,
    triggered_by,
    COUNT(*) AS nb_refresh_7j,
    MIN(created_at) AS premier,
    MAX(created_at) AS dernier
FROM materialized_view_refresh_log
WHERE created_at >= NOW() - INTERVAL '7 days'
  AND view_name IN ('product_sales_stats', 'expenses_summary', 'salaries_summary', 'bar_stats_multi_period')
GROUP BY view_name, triggered_by
ORDER BY view_name, nb_refresh_7j DESC;

-- 3. Confirmer si les vues sont matérialisées ou des vues normales
--    (l'historique montre des allers-retours matérialisée <-> normale
--    sur daily_sales_summary — vérifier que les autres n'ont pas le
--    même flottement)
SELECT
    schemaname,
    matviewname AS nom,
    'MATERIALIZED VIEW' AS type
FROM pg_matviews
WHERE matviewname IN (
    'product_sales_stats_mat', 'expenses_summary_mat',
    'salaries_summary_mat', 'bar_stats_multi_period_mat',
    'daily_sales_summary_mat'
)
UNION ALL
SELECT
    schemaname,
    viewname AS nom,
    'VIEW normale' AS type
FROM pg_views
WHERE viewname IN (
    'product_sales_stats_mat', 'expenses_summary_mat',
    'salaries_summary_mat', 'bar_stats_multi_period_mat',
    'daily_sales_summary_mat'
);
