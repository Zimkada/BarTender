-- =====================================================
-- PRE-VOL — Mappings de caisse orphelins (LECTURE SEULE)
-- Date : 2026-07-27
-- Contexte : un serveur retire de l'equipe (soft delete bar_members.is_active
--            = FALSE) conserve son nom dans server_name_mappings, donc dans le
--            selecteur de caisse du mode simplifie.
--
-- OBJECTIF : mesurer l'ampleur reelle en production AVANT d'ecrire la migration.
--            Repond a 3 inconnues : corps reel des fonctions, volume d'orphelins,
--            collisions de noms latentes.
--
-- GARANTIE : aucune ecriture. Que des SELECT. Aucun DDL, aucun DML.
--            Executable sans risque, a tout moment, meme en pleine activite.
--
-- USAGE : executer bloc par bloc dans le SQL Editor Supabase et conserver les
--         resultats. Chaque bloc est independant.
--
-- NOTE : dans le SQL Editor, auth.uid() vaut NULL. Ce script interroge donc les
--        tables directement, jamais via les RPC (dont les guards fausseraient tout).
-- =====================================================


-- =====================================================
-- BLOC 0 — Le schema est-il celui qu'on croit ?
-- =====================================================
-- A verifier : is_active absent (sinon migration deja passee), user_id nullable,
-- virtual_server_name present.

SELECT
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('server_name_mappings', 'bar_members')
ORDER BY table_name, ordinal_position;


-- =====================================================
-- BLOC 1 — Corps reel des fonctions en production
-- =====================================================
-- Les migrations sont appliquees a la main : le depot n'est PAS une preuve de
-- l'etat prod. On lit la source de verite.
--
-- A verifier dans add_bar_member_v2 :
--   (a) "check_plan_member_limit" present  -> version 20260402000000 bien appliquee
--   (b) "ON CONFLICT (bar_id, server_name) DO NOTHING" -> le bug de reactivation
--   (c) la collision de noms ne filtre pas sur is_active
-- A verifier dans remove_bar_member_v2 :
--   (d) aucune mention de server_name_mappings -> le bug d'origine

SELECT
    p.proname AS fonction,
    pg_get_function_identity_arguments(p.oid) AS signature,
    p.prosecdef AS security_definer,
    p.proconfig AS search_path_config,
    pg_get_functiondef(p.oid) AS corps_complet
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
      'add_bar_member_v2',
      'remove_bar_member_v2',
      'add_bar_member_existing',
      'assign_bar_member',
      'create_sale_idempotent'
  )
ORDER BY p.proname;


-- =====================================================
-- BLOC 2 — Volume global
-- =====================================================
-- Donne l'ordre de grandeur avant d'entrer dans le detail.

SELECT
    (SELECT COUNT(*) FROM public.server_name_mappings)                    AS total_mappings,
    (SELECT COUNT(*) FROM public.bars WHERE is_active = TRUE)             AS bars_actifs,
    (SELECT COUNT(*) FROM public.bar_members WHERE is_active = TRUE)      AS membres_actifs,
    (SELECT COUNT(*) FROM public.bar_members WHERE is_active = FALSE)     AS membres_inactifs,
    (SELECT COUNT(*) FROM public.bar_members WHERE user_id IS NULL)       AS membres_virtuels_residuels,
    (SELECT COUNT(*) FROM public.bars
      WHERE settings->>'operatingMode' = 'simplified')                    AS bars_mode_simplifie;


-- =====================================================
-- BLOC 3 — LE COEUR : inventaire des mappings orphelins
-- =====================================================
-- Un mapping est orphelin si le nom reste selectionnable en caisse alors que la
-- personne ne devrait plus y figurer. Trois causes distinctes :
--   MEMBRE_RETIRE     : is_active = FALSE (le bug signale)
--   PROMU_NON_SERVEUR : passe gerant/promoteur (migration 20260102 non rejouee)
--   MEMBRE_INEXISTANT : plus aucune ligne bar_members (integrite)
--
-- La colonne "impact_caisse" distingue le critique du cosmetique : un orphelin
-- sur un bar en mode simplifie est visible a la caisse MAINTENANT.

SELECT
    b.name                          AS bar,
    COALESCE(b.settings->>'operatingMode', 'non_configure') AS mode,
    snm.server_name                 AS nom_en_caisse,
    u.name                          AS nom_du_compte,
    bm.role                         AS role_actuel,
    bm.is_active                    AS membre_actif,
    CASE
        WHEN bm.user_id IS NULL              THEN 'MEMBRE_INEXISTANT'
        WHEN bm.is_active = FALSE            THEN 'MEMBRE_RETIRE'
        WHEN bm.role <> 'serveur'            THEN 'PROMU_NON_SERVEUR'
    END                             AS cause,
    CASE
        WHEN COALESCE(b.settings->>'operatingMode', '') = 'simplified'
        THEN 'CRITIQUE - visible en caisse'
        ELSE 'latent - mode complet'
    END                             AS impact_caisse,
    snm.created_at                  AS mapping_cree_le
FROM public.server_name_mappings snm
JOIN public.bars b        ON b.id = snm.bar_id
LEFT JOIN public.users u  ON u.id = snm.user_id
LEFT JOIN public.bar_members bm
       ON bm.bar_id = snm.bar_id
      AND bm.user_id = snm.user_id
WHERE bm.user_id IS NULL
   OR bm.is_active = FALSE
   OR bm.role <> 'serveur'
ORDER BY
    CASE WHEN COALESCE(b.settings->>'operatingMode', '') = 'simplified' THEN 0 ELSE 1 END,
    b.name,
    snm.server_name;


-- =====================================================
-- BLOC 4 — Collisions de noms latentes (RISQUE BLOQUANT)
-- =====================================================
-- L'index unique porte sur (bar_id, server_name) SANS user_id. Un mapping
-- orphelin OCCUPE donc le nom.
--
-- Consequence si on desactive au lieu de supprimer : reembaucher quelqu'un
-- portant ce prenom devient IMPOSSIBLE. add_bar_member_v2 rejette avec
-- "Le nom X est deja utilise par un autre serveur dans ce bar" -- et le mapping
-- fautif est invisible dans l'UI. Le promoteur est bloque sans explication.
--
-- Les prenoms se repetant beaucoup au Benin, ce cas n'est pas theorique.
--
-- Resultat VIDE = aucun bar bloque aujourd'hui.
-- Resultat NON VIDE = ces bars sont DEJA en situation de blocage.

SELECT
    b.name              AS bar,
    snm.server_name     AS nom_bloque,
    u_orphelin.name     AS compte_occupant_le_nom,
    bm_orphelin.role    AS son_role,
    bm_orphelin.is_active AS son_statut,
    u_actif.name        AS membre_actif_meme_nom,
    'Reembauche impossible sous ce nom' AS consequence
FROM public.server_name_mappings snm
JOIN public.bars b            ON b.id = snm.bar_id
LEFT JOIN public.users u_orphelin ON u_orphelin.id = snm.user_id
LEFT JOIN public.bar_members bm_orphelin
       ON bm_orphelin.bar_id = snm.bar_id
      AND bm_orphelin.user_id = snm.user_id
-- Un autre membre ACTIF du meme bar porte exactement ce nom
JOIN public.bar_members bm_actif
       ON bm_actif.bar_id = snm.bar_id
      AND bm_actif.is_active = TRUE
      AND bm_actif.user_id IS NOT NULL
      AND bm_actif.user_id <> snm.user_id
JOIN public.users u_actif
       ON u_actif.id = bm_actif.user_id
      AND TRIM(u_actif.name) = TRIM(snm.server_name)
-- ... alors que le mapping est orphelin
WHERE bm_orphelin.user_id IS NULL
   OR bm_orphelin.is_active = FALSE
   OR bm_orphelin.role <> 'serveur'
ORDER BY b.name, snm.server_name;


-- =====================================================
-- BLOC 5 — Bons ouverts rattaches a un mapping orphelin
-- =====================================================
-- Determine si un DELETE serait destructeur MAINTENANT.
--
-- useTickets.ts:400 resout le nom affiche d'un bon UNIQUEMENT via les mappings.
-- Supprimer la ligne anonymise des bons impayes = de l'argent en cours sur les
-- tables, sans nom pour le reclamer.
--
-- Resultat NON VIDE = le DELETE est formellement exclu, l'approche
-- "desactivation" est obligatoire.

SELECT
    b.name          AS bar,
    t.ticket_number AS bon_numero,
    snm.server_name AS nom_affiche_actuellement,
    bm.is_active    AS membre_actif,
    bm.role         AS role,
    t.created_at    AS bon_ouvert_depuis,
    COALESCE(SUM(s.total), 0) AS montant_en_cours
FROM public.tickets t
JOIN public.bars b            ON b.id = t.bar_id
JOIN public.server_name_mappings snm
       ON snm.bar_id = t.bar_id
      AND snm.user_id = t.server_id
LEFT JOIN public.bar_members bm
       ON bm.bar_id = t.bar_id
      AND bm.user_id = t.server_id
LEFT JOIN public.sales s
       ON s.ticket_id = t.id
      AND s.status = 'validated'
WHERE t.status = 'open'
  AND (bm.user_id IS NULL OR bm.is_active = FALSE OR bm.role <> 'serveur')
GROUP BY b.name, t.ticket_number, snm.server_name, bm.is_active, bm.role, t.created_at
ORDER BY t.created_at;


-- =====================================================
-- BLOC 6 — Ventes attribuees a un membre non actif
-- =====================================================
-- Mesure si le bug a DEJA produit des effets comptables : des ventes imputees a
-- quelqu'un qui n'etait plus dans l'equipe au moment de l'encaissement.
--
-- Fenetre 90 jours pour rester lisible.
-- Resultat non vide = le garde-fou p_server_id est urgent, pas theorique.

SELECT
    b.name                  AS bar,
    u.name                  AS serveur_credite,
    bm.is_active            AS actif_aujourdhui,
    bm.role                 AS role_actuel,
    COALESCE(s.operating_mode_at_creation, 'non_renseigne') AS mode_a_la_vente,
    COUNT(*)                AS nb_ventes,
    SUM(s.total)            AS montant_total,
    MIN(s.business_date)    AS premiere_vente,
    MAX(s.business_date)    AS derniere_vente
FROM public.sales s
JOIN public.bars b       ON b.id = s.bar_id
JOIN public.users u      ON u.id = s.server_id
LEFT JOIN public.bar_members bm
       ON bm.bar_id = s.bar_id
      AND bm.user_id = s.server_id
WHERE s.server_id IS NOT NULL
  AND s.status = 'validated'
  AND s.business_date >= CURRENT_DATE - INTERVAL '90 days'
  AND (bm.user_id IS NULL OR bm.is_active = FALSE OR bm.role <> 'serveur')
GROUP BY b.name, u.name, bm.is_active, bm.role, s.operating_mode_at_creation
ORDER BY montant_total DESC;


-- =====================================================
-- BLOC 7 — Etat RLS et privileges
-- =====================================================
-- Verifie la faille annexe reperee : les policies de server_name_mappings
-- exigent seulement bar_members.is_active = true, SANS filtre de role.
-- Un simple serveur pourrait donc reecrire les mappings de son bar et se
-- reattribuer les ventes d'un collegue.
--
-- Hors perimetre de la correction demandee, mais a documenter.

SELECT
    tablename,
    policyname,
    cmd     AS operation,
    roles,
    qual    AS condition_using,
    with_check AS condition_with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('server_name_mappings', 'bar_members')
ORDER BY tablename, cmd, policyname;

-- Privileges de table (anon ne doit RIEN avoir)
SELECT
    table_name,
    grantee,
    STRING_AGG(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('server_name_mappings', 'bar_members')
  AND grantee IN ('anon', 'authenticated', 'service_role', 'PUBLIC')
GROUP BY table_name, grantee
ORDER BY table_name, grantee;


-- =====================================================
-- BLOC 8 — Contraintes et index
-- =====================================================
-- Confirme que l'unicite porte bien sur (bar_id, server_name) sans user_id --
-- cause racine du risque de collision du BLOC 4.

SELECT
    i.relname       AS index_name,
    idx.indisunique AS est_unique,
    pg_get_indexdef(idx.indexrelid) AS definition
FROM pg_index idx
JOIN pg_class i ON i.oid = idx.indexrelid
JOIN pg_class t ON t.oid = idx.indrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND t.relname IN ('server_name_mappings', 'bar_members')
ORDER BY t.relname, i.relname;

-- Comportement ON DELETE des FK (server_id doit etre SET NULL)
SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS reference_vers,
    rc.delete_rule AS on_delete
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name
     AND kcu.table_schema = tc.table_schema
JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints rc
      ON rc.constraint_name = tc.constraint_name
     AND rc.constraint_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND (tc.table_name IN ('server_name_mappings', 'tickets')
       OR kcu.column_name IN ('server_id', 'user_id'))
  AND tc.table_name IN ('server_name_mappings', 'sales', 'tickets', 'returns', 'bar_members')
ORDER BY tc.table_name, kcu.column_name;


-- =====================================================
-- BLOC 9 — Triggers deja presents
-- =====================================================
-- S'assurer qu'aucun trigger existant n'entrerait en conflit avec celui prevu.
-- Resultat attendu : aucun trigger metier sur ces deux tables.

SELECT
    c.relname       AS table_name,
    t.tgname        AS trigger_name,
    CASE WHEN t.tgenabled = 'D' THEN 'DESACTIVE' ELSE 'actif' END AS statut,
    pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal
  AND n.nspname = 'public'
  AND c.relname IN ('server_name_mappings', 'bar_members')
ORDER BY c.relname, t.tgname;


-- =====================================================
-- SYNTHESE — grille de lecture
-- =====================================================
--
-- BLOC 0  : is_active deja present sur server_name_mappings ? -> migration deja
--           passee, STOP et reevaluer.
--
-- BLOC 1  : "check_plan_member_limit" absent d'add_bar_member_v2 ?
--           -> la prod n'est PAS a jour, la migration doit repartir du corps
--              reel et non du fichier 20260402000000.
--
-- BLOC 3  : nombre de lignes = ampleur du bug.
--           Lignes "CRITIQUE - visible en caisse" = noms fantomes actifs
--           aujourd'hui dans le selecteur.
--
-- BLOC 4  : NON VIDE = des bars sont DEJA bloques pour reembauche.
--           Change la priorite : ce n'est plus une amelioration mais un
--           correctif d'exploitation. Impose de traiter la liberation du nom
--           dans la migration.
--
-- BLOC 5  : NON VIDE = DELETE formellement exclu, approche "desactivation"
--           obligatoire. VIDE = fenetre plus confortable, mais le risque
--           reapparaitra des qu'un bon sera ouvert.
--
-- BLOC 6  : montants deja imputes a des non-membres. Nourrit l'arbitrage sur
--           l'urgence du guard p_server_id.
--
-- BLOC 9  : tout trigger inattendu = analyser avant d'ajouter le notre.
--
-- =====================================================
-- Aucune ecriture n'a ete effectuee par ce script.
-- =====================================================
