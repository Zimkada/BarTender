-- ============================================================
-- PRE-VOL COMPTOIRS - Releve de l'etat REEL avant le chantier
--
-- Contexte : chantier "comptoirs multiples sous un bar" (04/10/2026).
-- Decision de conception arretee : la cuisine reste UNIQUE au niveau bar,
-- seuls les ventes / bons / produits / stock descendent au comptoir.
--
-- ⚠️ POURQUOI CE SCRIPT EXISTE
-- Les fichiers de migration ne refletent PAS toujours l'etat reel de la
-- base - constate 3 fois sur ce projet (CREATE OR REPLACE successifs,
-- DROP oublies, SQL applique a la main dans le SQL Editor). Les chiffres
-- des 3 documents de cadrage (56 tables, 315 policies, 64 triggers, 463
-- fonctions) sont ceux du DEPOT. Ce script interroge la BASE.
--
-- ⚠️ Aucune de ces requetes n'ecrit. Lecture seule, sans effet de bord.
--
-- MODE D'EMPLOI : executer section par section dans le SQL Editor
-- Supabase, et coller les resultats dans le plan corrige.
-- (Rappel projet : les migrations de ce depot sont appliquees A LA MAIN
--  dans le SQL Editor, jamais par `db push`.)
-- ============================================================


-- ============================================================
-- SECTION 1 - VOLUMETRIE
-- Objectif : savoir si la migration du socle prend 1 seconde ou
-- immobilise la base. Determine s'il faut une fenetre d'intervention
-- hors service (les bars ferment apres minuit : creneau ~8h-16h).
-- ============================================================

SELECT
    c.relname                                   AS table_name,
    pg_size_pretty(pg_total_relation_size(c.oid)) AS taille_totale,
    c.reltuples::BIGINT                         AS lignes_estimees
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
      -- Les 6 tables qui DESCENDENT au comptoir
      'sales', 'bar_products', 'supplies', 'stock_adjustments',
      'returns', 'consignments',
      -- Le bon : porte le comptoir (decision 04/10)
      'tickets',
      -- Reference : restent au bar, pour comparaison de taille
      'expenses', 'kitchen_orders', 'kitchen_order_items'
  )
ORDER BY pg_total_relation_size(c.oid) DESC;

-- Lecture : une table de quelques dizaines de milliers de lignes se
-- migre a chaud. Au-dela du million, prevoir la fenetre.


-- ============================================================
-- SECTION 2 - LES 12 CONTRAINTES D'UNICITE  [ANGLE MORT BLOQUANT A-1]
-- Objectif : identifier toute contrainte qui empechera le 2e comptoir
-- de creer un produit portant le meme nom que le 1er.
-- C'est le defaut qui ne se voit pas en conception et casse en service.
-- ============================================================

SELECT
    con.conname        AS contrainte,
    cl.relname         AS table_name,
    con.contype        AS type,   -- u = unique, p = primary key
    pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class cl     ON cl.oid = con.conrelid
JOIN pg_namespace n  ON n.oid = cl.relnamespace
WHERE n.nspname = 'public'
  AND con.contype IN ('u', 'p')
  AND pg_get_constraintdef(con.oid) ILIKE '%bar_id%'
ORDER BY cl.relname, con.conname;

-- A faire avec ce resultat : pour CHAQUE ligne, trancher
--   -> devient unique par comptoir  (produits, categories de stock...)
--   -> reste unique par bar         (nom de serveur, lien WhatsApp...)
-- Une contrainte oubliee ici = refus d'insertion en pleine mise en service.


-- Variante : les INDEX uniques (pas toujours adosses a une contrainte)
SELECT
    i.relname    AS index_name,
    t.relname    AS table_name,
    pg_get_indexdef(i.oid) AS definition
FROM pg_class i
JOIN pg_index idx   ON idx.indexrelid = i.oid
JOIN pg_class t     ON t.oid = idx.indrelid
JOIN pg_namespace n ON n.oid = i.relnamespace
WHERE n.nspname = 'public'
  AND idx.indisunique
  AND pg_get_indexdef(i.oid) ILIKE '%bar_id%'
ORDER BY t.relname, i.relname;


-- ============================================================
-- SECTION 3 - INDEX UNIQUES DES VUES MATERIALISEES  [ANGLE MORT A-2]
-- Objectif : ces index conditionnent le REFRESH CONCURRENTLY. Si une vue
-- gagne la dimension comptoir sans que son index unique suive, le refresh
-- echoue EN SILENCE : la vue sert des donnees perimees sans alerte.
-- ============================================================

SELECT
    mv.matviewname                       AS vue_materialisee,
    pg_size_pretty(pg_total_relation_size(c.oid)) AS taille,
    i.relname                            AS index_unique,
    pg_get_indexdef(i.oid)               AS definition
FROM pg_matviews mv
JOIN pg_class c      ON c.relname = mv.matviewname
JOIN pg_namespace n  ON n.oid = c.relnamespace AND n.nspname = mv.schemaname
LEFT JOIN pg_index idx ON idx.indrelid = c.oid AND idx.indisunique
LEFT JOIN pg_class i   ON i.oid = idx.indexrelid
WHERE mv.schemaname = 'public'
ORDER BY mv.matviewname;

-- Lecture : une vue SANS index unique ne peut pas etre rafraichie en
-- CONCURRENTLY (elle verrouille les lectures pendant le refresh).
-- Une vue AVEC index unique sur bar_id seul devra l'etendre au comptoir.


-- ============================================================
-- SECTION 4 - LES TRIGGERS REELS  [ANGLE MORT A-3]
-- Objectif : le depot en compte 64. Combien tournent VRAIMENT, et
-- lesquels touchent les 6 tables qui descendent ?
-- Priorite absolue : le trigger de recalcul du CUMP. S'il ne devient pas
-- par-comptoir, deux comptoirs achetant au meme fournisseur a des prix
-- differents se contaminent la valorisation de stock.
-- ============================================================

SELECT
    c.relname        AS table_name,
    t.tgname         AS trigger_name,
    p.proname        AS fonction_appelee,
    CASE WHEN t.tgenabled = 'D' THEN 'DESACTIVE' ELSE 'actif' END AS etat,
    pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t
JOIN pg_class c      ON c.oid = t.tgrelid
JOIN pg_namespace n  ON n.oid = c.relnamespace
JOIN pg_proc p       ON p.oid = t.tgfoid
WHERE n.nspname = 'public'
  AND NOT t.tgisinternal          -- exclut les triggers de FK
  AND c.relname IN (
      'sales', 'bar_products', 'supplies', 'stock_adjustments',
      'returns', 'consignments', 'tickets'
  )
ORDER BY c.relname, t.tgname;

-- Compter le total reel, a comparer aux 64 du depot :
SELECT COUNT(*) AS triggers_reels_public
FROM pg_trigger t
JOIN pg_class c     ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal;


-- ============================================================
-- SECTION 5 - LES POLICIES RLS REELLES
-- Objectif : le depot en compte 315. Relever l'etat REEL sur les tables
-- qui descendent, en lisant USING **ET** WITH CHECK.
--
-- ⚠️ LECON DU PROJET : une policy correcte en lecture et trouee en
-- ecriture a deja permis d'ecrire sur un autre bar (helper
-- is_promoteur_or_admin sans filtre bar_id). Ne JAMAIS se contenter de
-- verifier USING.
-- ⚠️ Les policies PERMISSIVES se cumulent : une seule suffit a tout ouvrir.
-- ============================================================

SELECT
    pol.tablename,
    pol.policyname,
    pol.permissive,                 -- PERMISSIVE se cumule / RESTRICTIVE se combine en AND
    pol.cmd       AS commande,
    pol.roles,
    pol.qual      AS using_clause,      -- condition de LECTURE
    pol.with_check AS with_check_clause -- condition d'ECRITURE
FROM pg_policies pol
WHERE pol.schemaname = 'public'
  AND pol.tablename IN (
      'sales', 'bar_products', 'supplies', 'stock_adjustments',
      'returns', 'consignments', 'tickets'
  )
ORDER BY pol.tablename, pol.permissive DESC, pol.policyname;

-- Total reel, a comparer aux 315 du depot :
SELECT COUNT(*) AS policies_reelles_public
FROM pg_policies WHERE schemaname = 'public';

-- Reperer les tables SANS RLS (il ne doit en rester aucune parmi celles-ci)
SELECT c.relname AS table_sans_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND NOT c.relrowsecurity
  AND c.relname IN (
      'sales', 'bar_products', 'supplies', 'stock_adjustments',
      'returns', 'consignments', 'tickets'
  );


-- ============================================================
-- SECTION 6 - LES HELPERS RLS DONT TOUT DEPEND
-- Objectif : relever la definition REELLE des helpers utilises par les
-- policies. Trois d'entre eux se sont averes defaillants en prod le
-- 01/09/2026 (is_impersonating lisait user_metadata auto-modifiable ;
-- is_promoteur_or_admin sans filtre bar_id).
-- is_super_admin reste fragile : LIMIT 1 sans ORDER BY, 431 usages.
-- ============================================================

SELECT
    p.proname                                   AS fonction,
    pg_get_function_identity_arguments(p.oid)   AS arguments,
    p.prosecdef                                 AS security_definer,
    pg_get_functiondef(p.oid)                   AS definition_reelle
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (p.proname LIKE 'is\_%' OR p.proname LIKE 'can\_%'
       OR p.proname LIKE 'user\_has%' OR p.proname LIKE 'check\_user%')
ORDER BY p.proname;


-- ============================================================
-- SECTION 7 - LA CHAINE VENTE / BON / CUISINE
-- Objectif : valider la decision du 04/10 - le bon porte le comptoir et
-- la commande cuisine en herite.
--
-- ⚠️ POINT CRITIQUE : sales.ticket_id est NULLABLE. Si beaucoup de ventes
-- n'ont pas de bon, le bon NE PEUT PAS etre le seul porteur du comptoir :
-- la vente doit le porter elle-meme, sinon toutes les ventes sans bon
-- sont orphelines et le Z de caisse par comptoir est faux.
-- Cette requete mesure l'ampleur reelle du phenomene.
-- ============================================================

SELECT
    COUNT(*)                                            AS ventes_total,
    COUNT(ticket_id)                                    AS avec_bon,
    COUNT(*) - COUNT(ticket_id)                         AS sans_bon,
    ROUND(100.0 * (COUNT(*) - COUNT(ticket_id)) / NULLIF(COUNT(*), 0), 1)
                                                        AS pct_sans_bon
FROM public.sales;

-- Lecture : si pct_sans_bon est eleve (attendu : la majorite), cela
-- CONFIRME que `sales` doit porter counter_id en propre, et que la
-- concordance vente<->bon doit etre garantie par une contrainte en base.

-- Les commandes cuisine sont-elles TOUTES rattachees a un bon ?
-- (la FK est NOT NULL dans le depot - verifier qu'aucune donnee ne contredit)
SELECT
    COUNT(*)              AS commandes_cuisine_total,
    COUNT(ticket_id)      AS avec_ticket,
    COUNT(*) - COUNT(ticket_id) AS orphelines
FROM public.kitchen_orders;


-- ============================================================
-- SECTION 8 - ETAT DES LIEUX MULTI-BAR ACTUEL
-- Objectif : combien de bars, combien de membres par bar, et le mode
-- restaurant est-il actif ? Determine le perimetre de la migration et
-- si le probleme des plafonds d'abonnement [A-7] est imminent.
-- ============================================================

SELECT
    b.id,
    b.name,
    b.is_active,
    COUNT(bm.id) FILTER (WHERE bm.is_active)  AS membres_actifs,
    COUNT(DISTINCT bm.role) FILTER (WHERE bm.is_active) AS nb_roles_distincts
FROM public.bars b
LEFT JOIN public.bar_members bm ON bm.bar_id = b.id
GROUP BY b.id, b.name, b.is_active
ORDER BY membres_actifs DESC;

-- Plafonds d'abonnement [A-7] : Starter 4 / Pro 8 / Max 20 membres.
-- Un bar a 2 comptoirs = 2 gerants au lieu d'1. Un bar proche de son
-- plafond en sortira du seul fait du decoupage, sans avoir embauche.


-- ============================================================
-- SECTION 9 - LES 29 VUES SIMPLES  [ANGLE MORT A-4]
-- Objectif : les reperer, en priorisant celles qui servent de CONTROLE
-- D'INTEGRITE (pas d'affichage) - elles doivent continuer a fonctionner
-- alors que la cuisine reste au bar et les ventes descendent au comptoir.
-- ============================================================

SELECT
    v.viewname,
    CASE
        WHEN v.definition ILIKE '%bar_id%' THEN 'agrege par bar'
        ELSE 'sans bar_id'
    END AS portee,
    LENGTH(v.definition) AS taille_def
FROM pg_views v
WHERE v.schemaname = 'public'
ORDER BY
    -- les controles d'integrite d'abord
    (v.viewname ILIKE '%violation%' OR v.viewname ILIKE '%consistency%'
     OR v.viewname ILIKE '%status%') DESC,
    v.viewname;


-- ============================================================
-- SECTION 10 - TACHES PLANIFIEES  [ANGLE MORT A-6]
-- Objectif : 13 jobs releves dans le depot. Lesquels tournent vraiment,
-- et lesquels rafraichissent une vue qui gagnerait la dimension comptoir
-- (leur cout d'execution augmente avec le nombre de comptoirs).
-- ============================================================

SELECT
    jobid, jobname, schedule, active,
    LEFT(command, 160) AS commande
FROM cron.job
ORDER BY jobname;

-- Historique recent : un job qui echoue en silence se voit ici.
SELECT
    j.jobname,
    COUNT(*)                                  AS executions_7j,
    COUNT(*) FILTER (WHERE d.status != 'succeeded') AS echecs_7j,
    MAX(d.end_time)                           AS derniere_execution
FROM cron.job_run_details d
JOIN cron.job j ON j.jobid = d.jobid
WHERE d.start_time > NOW() - INTERVAL '7 days'
GROUP BY j.jobname
ORDER BY echecs_7j DESC, j.jobname;


-- ============================================================
-- SECTION 11 - CE QUE CE SCRIPT NE COUVRE PAS
--
-- A verifier hors SQL, pour ne pas recreer d'angle mort :
--
-- 1. CLES DE CACHE CLIENT [A-5] - src/lib/cache-strategy.ts indexe par
--    barId. Une serveuse qui bascule de comptoir verrait le stock du
--    precedent, servi depuis le cache. A traiter quand les ventes
--    descendent, pas plus tard. Concerne aussi la persistance
--    localStorage et la synchro cross-tab (BroadcastService).
--
-- 2. FILE D'ATTENTE OFFLINE - src/services/offlineQueue.ts indexe par
--    barId. Le comptoir doit etre FIGE au moment de la saisie, pas lu
--    au moment de la synchro, sinon une vente hors-ligne est rejouee au
--    mauvais comptoir. Corruption silencieuse de stock.
--
-- 3. SALES.ITEMS EN JSONB - aucune contrainte de base ne peut garantir
--    qu'un article vendu appartient au stock du comptoir de la vente.
--    La garantie doit etre portee par les fonctions de vente, avec un
--    test de non-regression dedie.
--
-- 4. ERGONOMIE DE LA BASCULE - non concue a ce jour. C'est elle qui
--    decidera de l'adoption par les serveuses en plein service.
--
-- 5. 7 EDGE FUNCTIONS - dont create-bar-member (a quel comptoir
--    affecter ?) et wa-webhook (le bot analyste repond-il consolide ou
--    par comptoir ?).
--
-- 6. DECISION COMMERCIALE [A-7] - le 2e comptoir releve-t-il le plafond
--    de membres, change-t-il de palier, ou se facture-t-il a part ?
-- ============================================================
