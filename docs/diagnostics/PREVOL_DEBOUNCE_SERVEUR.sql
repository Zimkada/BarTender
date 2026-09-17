-- ===================================================================
-- PRÉ-VOL — avant le débounce serveur du refresh
-- DATE : 2026-09-14
-- ===================================================================
--
-- ⚠️ LECTURE SEULE. Exécutable pendant le service.
--
-- ⭐ POURQUOI CE PRÉ-VOL EST OBLIGATOIRE (leçon projet) :
--    La migration qui suit fera un CREATE OR REPLACE sur
--    refresh_materialized_view_with_logging. Or :
--      1. CREATE OR REPLACE PERD LES GRANT. Aucun GRANT n'est documenté
--         pour ce RPC dans les fichiers de migration — il faut donc
--         relever les privilèges RÉELS ici pour pouvoir les restaurer.
--      2. Les fichiers ne reflètent pas la prod. La dernière définition
--         fichier date du 18/05 (20260518000000), mais 20260703050000
--         a appliqué un ALTER ... SET search_path par-dessus. Le corps
--         réel doit être relevé, pas supposé.
--
-- ⛔ NE PAS EXÉCUTER LA MIGRATION avant d'avoir lu ces résultats et de
--    me les avoir envoyés.
-- ===================================================================


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BLOC 1 — LE CORPS RÉEL DU RPC (à comparer au fichier du 18/05)  │
-- └─────────────────────────────────────────────────────────────────┘
--
-- Si ce corps diffère de 20260518000000_refresh_views_concurrently.sql,
-- la migration devra partir de CETTE version, pas du fichier.
--
-- À VÉRIFIER dans le résultat :
--   • la clause SET search_path (posée par vague4d) doit être présente
--   • le bloc CONCURRENTLY + son fallback doivent être là
--   • SECURITY DEFINER doit être conservé

SELECT pg_get_functiondef(p.oid) AS corps_reel
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'refresh_materialized_view_with_logging';


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BLOC 2 — LES PRIVILÈGES À RESTAURER APRÈS LE REPLACE            │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ⭐ C'est le bloc le plus important. CREATE OR REPLACE écrase proacl.
--    Ce que ce bloc montre devra être re-appliqué à l'identique après
--    la migration, puis re-vérifié en post-vol.
--
-- ⚠️ Noter en particulier anon_execute : s'il est à true, c'est par
--    héritage PUBLIC (=X/postgres), pas par un GRANT explicite. Ne PAS
--    chercher à le durcir au passage de ce chantier — le durcissement
--    RPC se fait au cas par cas, jamais en effet de bord.

SELECT
    p.proname                                                  AS fonction,
    pg_get_function_identity_arguments(p.oid)                  AS arguments,
    p.prosecdef                                                AS security_definer,
    p.proacl::text                                             AS privileges_bruts,
    has_function_privilege('authenticated', p.oid, 'EXECUTE')  AS authenticated_execute,
    has_function_privilege('anon', p.oid, 'EXECUTE')           AS anon_execute,
    has_function_privilege('service_role', p.oid, 'EXECUTE')   AS service_role_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'refresh_materialized_view_with_logging';


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BLOC 3 — CONFIRMER QUE LA VUE EST GLOBALE (pas par bar)         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ⭐ POINT DE CONCEPTION DÉCISIF, à confirmer avant d'écrire le verrou.
--
-- Le RPC a la signature (p_view_name, p_triggered_by) : AUCUN bar_id.
-- REFRESH MATERIALIZED VIEW recalcule la vue ENTIÈRE, tous bars
-- confondus. Deux bars différents déclenchent donc le MÊME refresh.
--
-- => Le verrou doit être PAR VUE, jamais par bar.
--
-- C'était l'erreur de ma première version côté navigateur : elle était
-- clé par barId, ce qui était doublement faux (mémoire locale ET
-- mauvaise granularité).
--
-- LECTURE : daily_sales_summary_mat doit contenir des lignes de
-- PLUSIEURS bars — ce qui prouve qu'elle est globale.

SELECT
    COUNT(DISTINCT bar_id)  AS nb_bars_dans_la_vue,
    COUNT(*)                AS nb_lignes_total
FROM daily_sales_summary_mat;


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BLOC 4 — AUCUNE TABLE DE VERROU NE DOIT DÉJÀ EXISTER            │
-- └─────────────────────────────────────────────────────────────────┘
--
-- La migration créera mat_view_refresh_lock. Vérifier qu'elle n'existe
-- pas déjà sous un autre nom / d'un chantier antérieur.
--
-- ATTENDU : 0 ligne.

SELECT
    schemaname,
    tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND (tablename ILIKE '%refresh%lock%' OR tablename ILIKE '%lock%refresh%');


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BLOC 5 — RÉFÉRENCE : coût actuel, pour mesurer l'effet après    │
-- └─────────────────────────────────────────────────────────────────┘
--
-- Fige la référence AVANT correctif, pour comparer ensuite.
-- Mesuré le 14/09 (bloc A) : post_mutation entre 42 et 95/jour,
-- ratio refresh/vente ~0,86-1,14 (le débounce navigateur n'agit pas).
--
-- ATTENDU APRÈS le débounce serveur : le ratio doit tomber nettement
-- sous 1, plafonné par la fenêtre de 60 s quel que soit le nombre
-- d'appareils.

SELECT
    DATE(created_at)                                        AS jour,
    COUNT(*) FILTER (WHERE triggered_by = 'post_mutation')  AS post_mutation,
    COUNT(*) FILTER (WHERE triggered_by = 'cron')           AS cron,
    COUNT(*) FILTER (WHERE triggered_by = 'manual')         AS manual,
    ROUND(SUM(duration_ms)::numeric / 1000, 1)              AS cpu_total_s
FROM materialized_view_refresh_log
WHERE created_at > now() - interval '7 days'
GROUP BY DATE(created_at)
ORDER BY jour DESC;
