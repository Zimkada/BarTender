-- ===================================================================
-- DIAGNOSTIC — Alerte "Disk IO Budget" Supabase (BarTender Pro)
-- DATE : 2026-09-10
-- CONTEXTE : alerte apparue alors que le nombre de bars est INCHANGÉ
--            par rapport aux mois précédents.
-- ===================================================================
--
-- ⚠️ LECTURE SEULE. Aucune de ces requêtes ne modifie la base.
--    Peut être exécuté pendant le service sans risque.
--
-- MODE D'EMPLOI : exécuter bloc par bloc dans le SQL Editor Supabase,
-- et me renvoyer les résultats. Les blocs sont indépendants.
--
-- ⭐ RAPPEL MÉTHODE (leçon projet) : les fichiers de migration ne
--    reflètent PAS toujours la prod. Tout ce qui suit relève l'état
--    RÉEL en base, jamais ce que les fichiers prétendent.
-- ===================================================================


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BLOC 1 — HYPOTHÈSE PRINCIPALE : helpers RLS VOLATILE            │
-- └─────────────────────────────────────────────────────────────────┘
--
-- POURQUOI : une fonction SQL sans marqueur de volatilité est VOLATILE
-- par défaut. Dans une policy RLS, PostgreSQL la ré-exécute alors POUR
-- CHAQUE LIGNE évaluée, au lieu d'une fois par requête. Sur une table
-- de 50 000 ventes, cela fait 50 000 SELECT sur bar_members pour un
-- seul SELECT applicatif -> Disk IO massif.
--
-- Les fichiers montrent que 016 déclarait get_user_role en STABLE, et
-- que 024 (postérieure) l'a redéfinie SANS STABLE. À confirmer en prod.
--
-- LECTURE DU RÉSULTAT :
--   provolatile = 's' -> STABLE   : correct
--   provolatile = 'i' -> IMMUTABLE: correct
--   provolatile = 'v' -> VOLATILE : ⚠️ C'EST LE PROBLÈME

SELECT
    p.proname                                AS fonction,
    CASE p.provolatile
        WHEN 'v' THEN '⚠️ VOLATILE — re-execute PAR LIGNE'
        WHEN 's' THEN 'STABLE — ok'
        WHEN 'i' THEN 'IMMUTABLE — ok'
    END                                      AS volatilite,
    p.prosecdef                              AS security_definer,
    pg_get_function_identity_arguments(p.oid) AS arguments
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
      'get_user_role', 'is_bar_member', 'is_super_admin',
      'is_promoteur_or_admin', 'is_impersonating',
      'check_bar_has_feature', 'is_bar_owner'
  )
ORDER BY p.provolatile DESC, p.proname;


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BLOC 2 — LES REQUÊTES QUI CONSOMMENT LE PLUS D'I/O              │
-- └─────────────────────────────────────────────────────────────────┘
--
-- C'est LE bloc qui désigne le coupable directement, sans hypothèse.
-- Classement par blocs disque lus (shared_blks_read = lectures ayant
-- réellement touché le disque, hors cache).
--
-- Si pg_stat_statements n'est pas activé, ce bloc renvoie une erreur :
-- l'activer via Dashboard > Database > Extensions, puis attendre
-- quelques heures d'activité avant de relire.

SELECT
    LEFT(query, 150)                                   AS requete,
    calls                                              AS appels,
    ROUND(total_exec_time::numeric / 1000, 1)          AS temps_total_s,
    ROUND(mean_exec_time::numeric, 1)                  AS temps_moyen_ms,
    shared_blks_read                                   AS blocs_lus_disque,
    shared_blks_hit                                    AS blocs_lus_cache,
    ROUND(
        100.0 * shared_blks_hit
        / NULLIF(shared_blks_hit + shared_blks_read, 0),
        1
    )                                                  AS pct_cache
FROM pg_stat_statements
WHERE query NOT ILIKE '%pg_stat%'
ORDER BY shared_blks_read DESC
LIMIT 25;


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BLOC 3 — TABLES SUBISSANT DES SEQUENTIAL SCANS                  │
-- └─────────────────────────────────────────────────────────────────┘
--
-- Un seq_scan lit la table ENTIÈRE depuis le disque. Sur une petite
-- table de config c'est normal ; sur sales/bar_products c'est une
-- cause directe de saturation I/O.
--
-- LECTURE : regarder les lignes où seq_scan est élevé ET où
-- lignes_lues_par_scan est grand (= grosse table scannée en entier).

SELECT
    relname                                        AS table_nom,
    n_live_tup                                     AS lignes_vivantes,
    seq_scan                                       AS scans_complets,
    idx_scan                                       AS scans_par_index,
    CASE WHEN seq_scan > 0
         THEN seq_tup_read / seq_scan
         ELSE 0 END                                AS lignes_lues_par_scan,
    ROUND(
        100.0 * idx_scan / NULLIF(idx_scan + seq_scan, 0),
        1
    )                                              AS pct_index,
    pg_size_pretty(pg_total_relation_size(relid))  AS taille
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY seq_tup_read DESC
LIMIT 20;


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BLOC 4 — BLOAT ET AUTOVACUUM                                    │
-- └─────────────────────────────────────────────────────────────────┘
--
-- HYPOTHÈSE ALTERNATIVE, à ne pas négliger : à charge CONSTANTE, une
-- base qui accumule des lignes mortes (dead tuples) voit son I/O
-- grimper progressivement — chaque scan lit aussi les lignes mortes.
-- C'est un candidat sérieux pour "même charge, plus de I/O qu'avant".
--
-- LECTURE : pct_lignes_mortes > 20% sur une grosse table = bloat réel.
-- Si last_autovacuum est ancien ou NULL sur une table très écrite,
-- l'autovacuum ne suit pas.

SELECT
    relname                                        AS table_nom,
    n_live_tup                                     AS lignes_vivantes,
    n_dead_tup                                     AS lignes_mortes,
    ROUND(
        100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0),
        1
    )                                              AS pct_lignes_mortes,
    last_autovacuum,
    last_autoanalyze,
    pg_size_pretty(pg_total_relation_size(relid))  AS taille_totale
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND n_dead_tup > 0
ORDER BY n_dead_tup DESC
LIMIT 20;


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BLOC 5 — INDEX INUTILISÉS (coût d'écriture pur)                 │
-- └─────────────────────────────────────────────────────────────────┘
--
-- Les fichiers de migration déclarent 11 index sur `sales`. CHAQUE
-- index doit être mis à jour à chaque INSERT/UPDATE : sur une table
-- très écrite comme sales, des index jamais lus coûtent de l'I/O
-- d'écriture en permanence sans rien accélérer.
--
-- LECTURE : idx_scan = 0 sur une table très écrite = candidat à la
-- suppression. ⚠️ NE RIEN SUPPRIMER sans vérifier : un index peut
-- servir une contrainte d'unicité ou une requête rare mais critique.

SELECT
    s.relname                                   AS table_nom,
    s.indexrelname                              AS index_nom,
    s.idx_scan                                  AS fois_utilise,
    pg_size_pretty(pg_relation_size(s.indexrelid)) AS taille,
    i.indisunique                               AS est_unique
FROM pg_stat_user_indexes s
JOIN pg_index i ON i.indexrelid = s.indexrelid
WHERE s.schemaname = 'public'
ORDER BY s.idx_scan ASC, pg_relation_size(s.indexrelid) DESC
LIMIT 30;


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BLOC 6 — TAILLE DES TABLES (croissance = sortie du cache)       │
-- └─────────────────────────────────────────────────────────────────┘
--
-- HYPOTHÈSE : à charge constante, si les données ont dépassé la RAM
-- disponible, ce qui était servi depuis le cache va désormais au
-- disque. Le symptôme apparaît sans aucun changement de code — ce qui
-- correspond exactement à la situation décrite.

SELECT
    relname                                        AS table_nom,
    n_live_tup                                     AS lignes,
    pg_size_pretty(pg_relation_size(relid))        AS taille_donnees,
    pg_size_pretty(
        pg_total_relation_size(relid) - pg_relation_size(relid)
    )                                              AS taille_index,
    pg_size_pretty(pg_total_relation_size(relid))  AS taille_totale
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 20;

-- Taille totale de la base (à comparer à la RAM du plan compute) :
SELECT pg_size_pretty(pg_database_size(current_database())) AS taille_base;


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BLOC 7 — TAUX DE CACHE GLOBAL                                   │
-- └─────────────────────────────────────────────────────────────────┘
--
-- LECTURE : un taux < 95% signale que la base lit trop souvent le
-- disque. > 99% = le cache fait son travail, chercher ailleurs.

SELECT
    SUM(heap_blks_read)                            AS blocs_lus_disque,
    SUM(heap_blks_hit)                             AS blocs_lus_cache,
    ROUND(
        100.0 * SUM(heap_blks_hit)
        / NULLIF(SUM(heap_blks_hit) + SUM(heap_blks_read), 0),
        2
    )                                              AS pct_cache_global
FROM pg_statio_user_tables;
