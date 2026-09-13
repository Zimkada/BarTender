-- ===================================================================
-- MIGRATION : Réduction du Disk IO - volatilité des helpers RLS,
--             index morts, bloat
-- DATE   : 2026-09-10
-- MOTIF  : alerte Supabase "Disk IO Budget depleting" à nombre de bars
--          CONSTANT.
-- ===================================================================
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ CE QUE LE DIAGNOSTIC A RÉELLEMENT MONTRÉ                        │
-- └─────────────────────────────────────────────────────────────────┘
--
-- Relevé en prod le 10/09/2026 (pg_stat_*, cron.job, pas les fichiers) :
--
--   • Cache global : 100,00 % (13 195 blocs disque contre 2,86 Md en RAM).
--     La base fait 159 MB et tient ENTIÈREMENT en mémoire.
--     => Le problème n'est PAS la lecture. Un upgrade compute serait
--        du gaspillage.
--
--   • Le cron est SAIN : un seul job de refresh, */30, 48 exécutions/24h,
--     160 s CPU/jour. La migration 20260607160000 tient parfaitement.
--
--   • La cause dominante était APPLICATIVE : 2 475 refresh 'post_mutation'
--     de daily_sales_summary (1,6 s de réécriture disque CHACUN),
--     déclenchés à chaque vente. ⚠️ CE POINT N'EST PAS TRAITÉ PAR CETTE
--     MIGRATION SQL (il se corrige côté code) - mais il a DÉJÀ ÉTÉ TRAITÉ
--     ailleurs : commit c78be5b (10/09), ANCÊTRE du présent commit, a
--     débouncé ce refresh à 1/min/bar. Voir la section "CE QUI RESTE À
--     FAIRE" en fin de fichier, mise à jour le 13/09/2026 pour refléter
--     cet état - ne pas se fier à sa version d'origine sur ce point.
--
-- Cette migration traite les causes SECONDAIRES, réelles mais mineures
-- au regard du refresh applicatif. Ne pas en attendre la disparition de
-- l'alerte à elle seule.
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ SÉCURITÉ / RÉVERSIBILITÉ                                        │
-- └─────────────────────────────────────────────────────────────────┘
--
-- • AUCUN corps de fonction n'est réécrit. On utilise ALTER FUNCTION,
--   qui change la volatilité SANS toucher au code ni aux privilèges.
--   ⭐ C'est délibéré : la leçon projet dit que les fichiers de migration
--      ne reflètent pas la prod (check_bar_has_feature a notamment été
--      modifiée par 20260703050000_vague4d_search_path_hardening).
--      Un CREATE OR REPLACE écraserait la version réelle ET perdrait les
--      GRANT. ALTER FUNCTION ne présente aucun de ces deux risques.
--
-- • AUCUNE suppression d'index n'est effectuée ni proposée : l'étape 2
--   explique pourquoi (l'un des candidats sert une RPC vivante) et
--   documente la démarche correcte pour un nettoyage ultérieur.
--
-- • BREAKING_CHANGE : NON. Aucun changement de comportement fonctionnel.
-- • RLS_CHANGES     : AUCUN. Les policies sont inchangées.
-- • IDEMPOTENT      : étape 1 OUI (ALTER FUNCTION est rejouable sans
--                     effet de bord). Étape 3 : REJOUABLE, mais pas
--                     « idempotente » au sens strict - VACUUM prend des
--                     verrous et refait un travail réel à chaque passage.
--                     D'où l'avertissement ci-dessous.
--
-- ⚠️ NE PAS EXÉCUTER PENDANT LE SERVICE : l'étape 3 (VACUUM) pose des
--    verrous. Exécuter en dehors des heures d'ouverture des bars.
-- ===================================================================


-- ═══════════════════════════════════════════════════════════════════
-- ÉTAPE 0 - PRÉ-VOL (lecture seule, à exécuter et à CONSERVER)
-- ═══════════════════════════════════════════════════════════════════
--
-- Relève l'état AVANT modification : volatilité et privilèges des 3
-- helpers. Garder ce résultat permet de comparer au post-vol et de
-- prouver que les GRANT ont survécu.

SELECT
    p.proname                                   AS fonction,
    pg_get_function_identity_arguments(p.oid)   AS arguments,
    p.provolatile                               AS volatilite_avant,
    p.proacl::text                              AS privileges_avant,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
    has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('get_user_role', 'is_bar_member', 'check_bar_has_feature')
ORDER BY p.proname;


-- ═══════════════════════════════════════════════════════════════════
-- ÉTAPE 1 - VOLATILITÉ DES HELPERS RLS  (le vrai gain de fond)
-- ═══════════════════════════════════════════════════════════════════
--
-- POURQUOI : une fonction SQL sans marqueur de volatilité est VOLATILE
-- par défaut. Dans une policy RLS, PostgreSQL la ré-exécute alors POUR
-- CHAQUE LIGNE évaluée au lieu d'une fois par requête.
--
-- Preuve chiffrée relevée en prod : bar_members (92 lignes vivantes)
-- a subi 85 767 791 scans séquentiels + 640 189 280 scans d'index.
-- Sur une table de 92 lignes, ces ordres de grandeur ne s'expliquent
-- que par la ré-évaluation par ligne depuis les policies.
--
-- Aujourd'hui ces relectures sont servies par la RAM (cache 100 %),
-- donc elles ne causent PAS l'alerte disque - mais elles consomment du
-- CPU en permanence et se dégraderaient nettement à mesure que les
-- données grossissent (objectif 50 bars).
--
-- STABLE est le marqueur correct : le résultat ne change pas à
-- l'intérieur d'une même requête, mais peut changer entre deux
-- requêtes (changement de rôle, de membership). IMMUTABLE serait FAUX
-- ici et casserait la sécurité.
--
-- ⭐ ALTER FUNCTION préserve le corps ET les privilèges.

ALTER FUNCTION public.get_user_role(uuid) STABLE;
ALTER FUNCTION public.is_bar_member(uuid) STABLE;
ALTER FUNCTION public.check_bar_has_feature(uuid, text) STABLE;


-- ═══════════════════════════════════════════════════════════════════
-- ÉTAPE 2 - INDEX JAMAIS UTILISÉS SUR `sales`   ⚠️ NE RIEN SUPPRIMER ICI
-- ═══════════════════════════════════════════════════════════════════
--
-- CONTEXTE : `sales` porte 23 MB d'index pour 14 MB de données. Chaque
-- index doit être mis à jour à CHAQUE vente - un index jamais lu coûte
-- de l'écriture disque en permanence sans rien accélérer.
--
-- Relevé prod (pg_stat_user_indexes, idx_scan = 0) :
--   idx_sales_items_gin              2912 kB
--   idx_sales_created_by_validated   1520 kB
--   idx_sales_validated_by            312 kB
--   idx_sales_rejected_by             240 kB
--   idx_sales_applied_promotions_gin  200 kB
--   idx_sales_cancelled_at             16 kB
--   idx_sales_rejected_at              16 kB
--
-- ⛔ AUCUNE SUPPRESSION N'EST PROPOSÉE DANS CETTE MIGRATION.
--
--    ⭐ CORRECTION (revue du 10/09/2026) : une première version listait
--       ces sept index en DROP commentés. Vérification faite, au moins
--       l'un d'eux N'EST PAS SUPPRIMABLE :
--
--       idx_sales_created_by_validated porte ce commentaire en base
--       (20251227000100_add_mode_switching_index.sql:57) :
--         « Optimise clause OR (created_by = X) dans RPC
--           top_products_by_server »
--       ⚠️ CORRECTION (revue du 13/09/2026) : le commentaire en base
--       lui-même porte un nom raccourci. La RPC réellement appelée est
--       get_top_products_by_server (analytics.service.ts:154, rpcName
--       choisi quand serverId est fourni) - une recherche littérale du
--       nom exact du commentaire ne matchera donc PAS ce fichier.
--       Cette RPC est VIVANTE : analytics.service.ts:154 l'appelle dès
--       qu'un serveur consulte ses propres top produits. Son idx_scan
--       est à 0 parce que les statistiques sont probablement récentes,
--       PAS parce que l'index est inutile.
--
--    C'est l'illustration exacte du piège : `idx_scan = 0` signifie
--    « jamais utilisé DEPUIS LE DERNIER RESET DES STATISTIQUES », jamais
--    « inutile ».
--
-- DÉMARCHE CORRECTE, si vous voulez poursuivre ce nettoyage plus tard :
--
--   1. Vérifier depuis quand les statistiques courent :
--        SELECT stats_reset FROM pg_stat_database
--        WHERE datname = current_database();
--      Si le reset date de moins d'un mois, l'information ne vaut rien :
--      attendre au minimum un cycle complet (clôtures mensuelles incluses).
--
--   2. Pour CHAQUE index candidat, chercher son consommateur avant de
--      conclure - commentaire en base, RPC, Edge Function, export :
--        SELECT indexrelid::regclass, obj_description(indexrelid, 'pg_class')
--        FROM pg_index WHERE indrelid = 'sales'::regclass;
--
--   3. Ne supprimer qu'avec la définition EXACTE conservée pour recréation.
--      Plusieurs de ces index sont PARTIELS : les recréer sans leur clause
--      WHERE produirait un index pleine table, bien plus lourd que
--      l'original (16 kB -> plusieurs MB). Définitions réelles relevées
--      dans les migrations d'origine :
--
--        CREATE INDEX idx_sales_created_by_validated
--          ON sales(created_by, created_at DESC)
--          WHERE status = 'validated' AND created_by IS NOT NULL;
--
--        CREATE INDEX idx_sales_cancelled_at
--          ON public.sales(cancelled_at)
--          WHERE cancelled_at IS NOT NULL;
--
--        CREATE INDEX idx_sales_rejected_at
--          ON public.sales(rejected_at)
--          WHERE rejected_at IS NOT NULL;
--
--        CREATE INDEX idx_sales_items_gin ON sales USING GIN (items);
--        CREATE INDEX idx_sales_applied_promotions_gin
--          ON sales USING GIN (applied_promotions);
--
--   4. Utiliser DROP INDEX CONCURRENTLY, UNE instruction à la fois, hors
--      transaction.
--
-- Gain potentiel (~5 MB d'écritures évitées par vente) : réel mais
-- MARGINAL face au refresh post_mutation décrit en fin de fichier.
-- Ne pas prendre de risque sur les index pour un gain de second ordre.


-- ═══════════════════════════════════════════════════════════════════
-- ÉTAPE 3 - BLOAT : tables jamais nettoyées
-- ═══════════════════════════════════════════════════════════════════
--
-- Relevé prod : des tables très lues portent une proportion élevée de
-- lignes mortes, que CHAQUE scan doit lire en plus des lignes vivantes.
--
--   bar_members       39,5 % mortes   dernier autovacuum : 28/02/2026
--   server_name_map.  58,4 % mortes   dernier autovacuum : 19/02/2026
--   promotions        72,1 % mortes   autovacuum : JAMAIS
--   consignments      61,5 % mortes   autovacuum : JAMAIS
--   global_products   55,9 % mortes   autovacuum : JAMAIS
--   ingredients       89,1 % mortes   autovacuum : JAMAIS
--
-- bar_members est le cas le plus coûteux : 39,5 % de déchet sur la table
-- la plus sollicitée de la base (85 M de scans séquentiels).
--
-- VACUUM (sans FULL) est choisi délibérément : il récupère l'espace pour
-- réutilisation SANS verrou exclusif ni réécriture complète de la table.
-- VACUUM FULL prendrait un ACCESS EXCLUSIVE LOCK - donc une coupure de
-- service - pour un gain marginal sur des tables de cette taille (< 1 MB).
--
-- ANALYZE remet à jour les statistiques du planificateur : plusieurs de
-- ces tables n'ont pas été analysées depuis des mois, ce qui peut à soi
-- seul produire de mauvais plans d'exécution.

VACUUM (ANALYZE) public.bar_members;
VACUUM (ANALYZE) public.server_name_mappings;
VACUUM (ANALYZE) public.promotions;
VACUUM (ANALYZE) public.consignments;
VACUUM (ANALYZE) public.global_products;
VACUUM (ANALYZE) public.ingredients;
VACUUM (ANALYZE) public.bar_categories;
VACUUM (ANALYZE) public.kitchen_order_items;
VACUUM (ANALYZE) public.ingredient_lots;
VACUUM (ANALYZE) public.dishes;
VACUUM (ANALYZE) public.wa_conversations;
VACUUM (ANALYZE) public.bar_activity;

-- ⚠️ VACUUM ne peut pas s'exécuter dans un bloc transactionnel.
--    Dans le SQL Editor Supabase, lancer ces lignes SANS les entourer
--    d'un BEGIN/COMMIT (elles sont hors transaction par défaut).


-- ═══════════════════════════════════════════════════════════════════
-- ÉTAPE 4 - POST-VOL (lecture seule, OBLIGATOIRE)
-- ═══════════════════════════════════════════════════════════════════
--
-- ⭐ Leçon projet : après toute modification de fonction, vérifier que
--    les privilèges ont survécu. ALTER FUNCTION ne devrait pas les
--    toucher - ce contrôle prouve que c'est bien le cas.
--
-- ATTENDU :
--   volatilite_apres      = 's' pour les trois (au lieu de 'v')
--   authenticated_execute = true  (INCHANGÉ vs pré-vol)
--   anon_execute          : DOIT être identique au pré-vol.
--     ⚠️ Ne PAS chercher à le durcir ici : 162 fonctions sont exécutables
--        par anon dans cette base par héritage PUBLIC, et le durcissement
--        se fait au cas par cas, jamais au passage d'un autre chantier.

SELECT
    p.proname                                   AS fonction,
    pg_get_function_identity_arguments(p.oid)   AS arguments,
    CASE p.provolatile
        WHEN 'v' THEN '⚠️ ENCORE VOLATILE - échec'
        WHEN 's' THEN '✅ STABLE - corrigé'
        WHEN 'i' THEN '⚠️ IMMUTABLE - inattendu'
    END                                         AS volatilite_apres,
    p.proacl::text                              AS privileges_apres,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
    has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('get_user_role', 'is_bar_member', 'check_bar_has_feature')
ORDER BY p.proname;

-- Contrôle du bloat après VACUUM (les pct doivent avoir chuté) :
SELECT
    relname                                     AS table_nom,
    n_live_tup                                  AS lignes_vivantes,
    n_dead_tup                                  AS lignes_mortes,
    ROUND(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 1)
                                                AS pct_mortes_apres,
    last_vacuum,
    last_analyze
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND relname IN ('bar_members', 'server_name_mappings', 'promotions',
                  'consignments', 'global_products', 'ingredients',
                  'bar_categories', 'kitchen_order_items', 'ingredient_lots',
                  'dishes', 'wa_conversations', 'bar_activity')
ORDER BY relname;


-- ═══════════════════════════════════════════════════════════════════
-- SMOKE-TESTS À FAIRE DANS L'UI (pas dans le SQL Editor)
-- ═══════════════════════════════════════════════════════════════════
--
-- ⭐ Le SQL Editor s'exécute avec auth.uid() = NULL : les policies RLS
--    n'y sont pas représentatives. Les trois helpers modifiés étant au
--    cœur du RBAC, la vérification DOIT passer par l'application.
--
--   1. Connexion en `serveur`     -> voit ses ventes, pas la compta
--   2. Connexion en `gerant`      -> voit stocks et analytiques
--   3. Connexion en `promoteur`   -> accès complet à son bar
--   4. Connexion en `co_promoteur`-> même périmètre que promoteur
--   5. Multi-bar : basculer de bar -> aucune fuite de données entre bars
--   6. Créer une vente            -> passe normalement
--   7. Page Comptabilité          -> le gating par plan fonctionne
--      (check_bar_has_feature : un bar sans le plan compta reste bloqué)
--
-- Le point 7 est le plus important : check_bar_has_feature gouverne le
-- gating par plan. Si le gating sautait, un bar accéderait à une
-- fonctionnalité non souscrite.
--
-- ROLLBACK (si un comportement RBAC changeait, ce qui n'est pas attendu) :
--   ALTER FUNCTION public.get_user_role(uuid) VOLATILE;
--   ALTER FUNCTION public.is_bar_member(uuid) VOLATILE;
--   ALTER FUNCTION public.check_bar_has_feature(uuid, text) VOLATILE;


-- ═══════════════════════════════════════════════════════════════════
-- CE QUI RESTE À FAIRE - HORS SQL
-- ═══════════════════════════════════════════════════════════════════
--
-- ⭐⭐ MISE À JOUR (revue du 13/09/2026) - LA CAUSE PRINCIPALE EST
--    DÉSORMAIS TRAITÉE, PISTE (b) CI-DESSOUS. Cette section a été écrite
--    avant ce correctif et le présentait comme une décision produit
--    encore ouverte - ce qui n'est PLUS le cas. Commit c78be5b (10/09,
--    ANCÊTRE de la présente migration) a mis en place le débounce
--    décrit en piste (b) : REFRESH_SUMMARY_MIN_INTERVAL_MS = 60_000,
--    plafonné par bar via shouldRefreshSummary() dans
--    src/hooks/mutations/useSalesMutations.ts (l'appel gaté est
--    aujourd'hui ~ligne 165, PAS 128 - ce fichier a bougé depuis).
--    Fraîcheur actuelle du CA du jour : 1 min max, au lieu
--    d'instantané. Gain estimé x5 à x20 selon le rythme de ventes,
--    à confirmer par un nouveau relevé pg_stat_statements.
--    Les pistes (a) et (c) RESTENT des options futures valables si le
--    débounce s'avérait insuffisant à l'échelle - le texte original
--    ci-dessous est conservé tel quel pour cette raison, mais ne plus
--    le lire comme "rien n'est fait".
--
-- ⚠️ ANALYSE ORIGINALE (avant le correctif du 10/09), conservée pour
--    le raisonnement qu'elle documente :
--
--    src/hooks/mutations/useSalesMutations.ts (ligne alors 128, gel du
--    fichier à cette date)
--      await AnalyticsService.refreshView('daily_sales_summary', 'post_mutation');
--
--    Ce refresh réécrit la vue matérialisée ENTIÈRE (1,6 s de disque) à
--    chaque vente validée. 2 475 exécutions relevées, dont 76 sur les
--    dernières 24 h. C'était alors le premier poste de Disk IO de la
--    base - piste (b) ci-dessous l'a depuis réduit d'un ordre de
--    grandeur.
--
--    Son commentaire disait : « Sur free tier Supabase (pas de pg_cron),
--    c'est le seul moyen de garder la mat view à jour ». Le projet est
--    sur Pro, avec un cron */30 actif et vérifié.
--
-- ⛔ MAIS : NE PAS SUPPRIMER CE REFRESH SANS TRAITER LA FRAÎCHEUR.
--
--    ⭐ CORRECTION D'UNE ANALYSE ERRONÉE (revue du 10/09/2026).
--    Une première lecture avait conclu que daily_sales_summary n'avait
--    qu'un seul consommateur (AccountingOverview.tsx:185, graphique
--    12 mois agrégé PAR MOIS, insensible à 30 min de retard). C'ÉTAIT
--    FAUX. La vue a au moins TROIS consommateurs, dont un critique :
--
--      1. AccountingOverview.tsx:185 - groupBy 'month', 12 mois.
--         Tolère parfaitement 30 min de retard.
--
--      2. AnalyticsService.getRevenueSummary (analytics.service.ts:225)
--         appelle getDailySummary SANS groupBy -> granularité 'day'
--         (valeur par défaut). Il agrège net_revenue, validated_count,
--         cash/mobile/card_revenue.
--
--      3. useSalesStats.ts:39 (écran Historique des ventes) consomme
--         getRevenueSummary avec ce commentaire explicite :
--           « Charger le CA exact via le backend (Source de vérité) »
--
--    => Retirer le refresh post_mutation ferait SOUS-ESTIMER le CA du
--       jour de 0 à 30 minutes de ventes sur un écran présenté comme la
--       source de vérité, consulté EN SERVICE par les promoteurs.
--       Pour un POS, c'est un défaut fonctionnel inacceptable - bien
--       plus grave que l'alerte Disk IO qu'on cherche à corriger.
--
--    Le commentaire « V12 » d'AccountingOverview.tsx:189 (« Revenue via
--    query directe au lieu de la vue matérialisée ») ne concerne QUE cet
--    écran-là. La migration vers les tables brutes n'a jamais été
--    étendue à getRevenueSummary.
--
-- PISTES (a) ET (c) - ENCORE OUVERTES si le débounce (b) s'avère
-- insuffisant à l'échelle. (b) est FAIT, détail ci-dessous :
--
--    a) Migrer getRevenueSummary vers les tables brutes, comme l'a déjà
--       fait AccountingOverview avec useRevenueStats. Le refresh
--       post_mutation deviendrait alors inutile et pourrait être
--       supprimé. L'option la plus propre, et celle qui achèverait une
--       migration déjà commencée. Coût : vérifier la parité des 6
--       champs agrégés. NON FAIT - reste une piste future.
--
--    b) ✅ FAIT (commit c78be5b, 10/09/2026) : le refresh est débouncé
--       à 1/min/bar via shouldRefreshSummary() dans
--       useSalesMutations.ts. Gain estimé x5 à x20 selon le rythme de
--       ventes. Fraîcheur du CA du jour : 1 min max au lieu
--       d'instantané.
--
--    c) Remplacer REFRESH MATERIALIZED VIEW par une mise à jour
--       incrémentale de la seule journée courante. Le plus efficace,
--       le plus coûteux à écrire.
--
--    ⚠️ Ne PAS choisir sur la seule base de ce commentaire : mesurer
--       d'abord l'effet des étapes 1 à 3 ci-dessus, puis décider.
-- ===================================================================
