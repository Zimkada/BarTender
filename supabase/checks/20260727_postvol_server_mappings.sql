-- =====================================================
-- POST-VOL — Certification de 20260727010000 (LECTURE SEULE)
-- Date : 2026-07-27
--
-- À exécuter APRÈS la migration, dans le SQL Editor.
-- Chaque bloc indique son résultat ATTENDU. Tout écart = ne pas certifier.
--
-- Rappel : dans le SQL Editor auth.uid() vaut NULL. Le smoke-test fonctionnel
-- (dernier bloc) doit donc se faire via l'UI, pas ici.
-- =====================================================


-- =====================================================
-- 1. La colonne existe
-- ATTENDU : is_active | boolean | NO | true
-- =====================================================
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'server_name_mappings'
  AND column_name = 'is_active';


-- =====================================================
-- 2. Le trigger est en place et actif
-- ATTENDU : 1 ligne, statut = 'actif',
--           definition contenant "AFTER INSERT OR UPDATE"
-- =====================================================
SELECT
    t.tgname AS trigger_name,
    CASE WHEN t.tgenabled = 'D' THEN 'DESACTIVE' ELSE 'actif' END AS statut,
    pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t
JOIN pg_class c     ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal
  AND n.nspname = 'public'
  AND c.relname = 'bar_members'
  AND t.tgname = 'trg_sync_server_mapping';


-- =====================================================
-- 3. Backfill — état des mappings après migration
-- ATTENDU : mappings_actifs_non_serveurs = 0
--           mappings_inactifs = 3  (Bastou, Tata bignon, Serveur TEST4)
-- =====================================================
SELECT
    COUNT(*)                                        AS total_mappings,
    COUNT(*) FILTER (WHERE snm.is_active = TRUE)    AS mappings_actifs,
    COUNT(*) FILTER (WHERE snm.is_active = FALSE)   AS mappings_inactifs,
    COUNT(*) FILTER (
        WHERE snm.is_active = TRUE
          AND NOT EXISTS (
              SELECT 1 FROM public.bar_members bm
              WHERE bm.bar_id = snm.bar_id
                AND bm.user_id = snm.user_id
                AND bm.role = 'serveur'
                AND bm.is_active = TRUE
          )
    )                                               AS mappings_actifs_non_serveurs
FROM public.server_name_mappings snm;


-- =====================================================
-- 4. Les 3 mappings de managers ont bien disparu
-- ATTENDU : résultat VIDE
-- =====================================================
SELECT
    b.name          AS bar,
    snm.server_name AS mapping_restant,
    bm.role         AS role_du_membre,
    'Un mapping de manager subsiste' AS anomalie
FROM public.server_name_mappings snm
JOIN public.bars b         ON b.id = snm.bar_id
JOIN public.bar_members bm ON bm.bar_id = snm.bar_id AND bm.user_id = snm.user_id
WHERE bm.role <> 'serveur';


-- =====================================================
-- 5. Détail des mappings désactivés
-- ATTENDU : exactement 3 lignes — Bastou (Bar Tour Eiffel),
--           Tata bignon (Bar Restau ESPOIR), Serveur TEST4 (PRESTIGE BAR 1)
-- =====================================================
SELECT
    b.name          AS bar,
    snm.server_name AS nom,
    u.name          AS compte,
    bm.role,
    bm.is_active    AS membre_actif,
    snm.updated_at  AS desactive_le
FROM public.server_name_mappings snm
JOIN public.bars b        ON b.id = snm.bar_id
LEFT JOIN public.users u  ON u.id = snm.user_id
LEFT JOIN public.bar_members bm
       ON bm.bar_id = snm.bar_id AND bm.user_id = snm.user_id
WHERE snm.is_active = FALSE
ORDER BY b.name, snm.server_name;


-- =====================================================
-- 6. Aucun bon ouvert n'a perdu son libellé
-- ATTENDU : résultat VIDE
-- Les mappings désactivés restent lisibles : le nom d'un bon ouvert doit
-- toujours se résoudre (useTickets.ts ne filtre pas sur is_active).
-- =====================================================
SELECT
    b.name          AS bar,
    t.ticket_number AS bon,
    t.server_id,
    'Bon ouvert sans mapping résolvable' AS anomalie
FROM public.tickets t
JOIN public.bars b ON b.id = t.bar_id
WHERE t.status = 'open'
  AND t.server_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM public.server_name_mappings snm
      WHERE snm.bar_id = t.bar_id
        AND snm.user_id = t.server_id
  );


-- =====================================================
-- 7. add_bar_member_v2 — durcissement préservé
-- ATTENDU : search_path_config = {"search_path=public, extensions"}
--           collision_filtre_inactifs = true
--           mapping_do_update = true   (le DO NOTHING a disparu)
-- =====================================================
SELECT
    p.proname,
    p.prosecdef AS security_definer,
    p.proconfig AS search_path_config,
    pg_get_functiondef(p.oid) LIKE '%AND is_active = TRUE%'        AS collision_filtre_inactifs,
    pg_get_functiondef(p.oid) LIKE '%ON CONFLICT (bar_id, server_name)%DO UPDATE%' AS mapping_do_update,
    pg_get_functiondef(p.oid) LIKE '%check_plan_member_limit%'     AS limite_plan_conservee
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'add_bar_member_v2';


-- =====================================================
-- 8. Privilèges — anon ne doit rien avoir
-- ATTENDU : authenticated = true, anon = false, PUBLIC = false
-- =====================================================
SELECT
    'add_bar_member_v2' AS fonction,
    has_function_privilege('authenticated',
        'public.add_bar_member_v2(uuid, uuid, text, uuid)', 'EXECUTE') AS authenticated_peut,
    has_function_privilege('anon',
        'public.add_bar_member_v2(uuid, uuid, text, uuid)', 'EXECUTE') AS anon_peut;

-- La fonction du trigger ne doit être appelable par personne directement
-- ATTENDU : anon = false, authenticated = false
SELECT
    'sync_server_mapping_on_member_change' AS fonction,
    has_function_privilege('anon',
        'public.sync_server_mapping_on_member_change()', 'EXECUTE') AS anon_peut,
    has_function_privilege('authenticated',
        'public.sync_server_mapping_on_member_change()', 'EXECUTE') AS authenticated_peut;


-- =====================================================
-- 9. Index partiel créé
-- ATTENDU : idx_server_mappings_bar_active présent, avec WHERE (is_active = true)
-- =====================================================
SELECT
    i.relname AS index_name,
    pg_get_indexdef(idx.indexrelid) AS definition
FROM pg_index idx
JOIN pg_class i     ON i.oid = idx.indexrelid
JOIN pg_class t     ON t.oid = idx.indrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND t.relname = 'server_name_mappings'
  AND i.relname = 'idx_server_mappings_bar_active';


-- =====================================================
-- 10. SMOKE-TEST FONCTIONNEL — À FAIRE VIA L'UI, PAS ICI
-- =====================================================
-- auth.uid() étant NULL dans le SQL Editor, les guards des RPC rejettent tout
-- appel direct. Ces scénarios doivent être joués depuis l'application, sur un
-- bar de test :
--
--   A. RETRAIT
--      1. Bar en mode simplifié, noter les noms du sélecteur de caisse.
--      2. Retirer un serveur depuis Équipe.
--      3. Vérifier : son nom a DISPARU du sélecteur.
--      4. Requête ci-dessous : is_active = FALSE, ligne CONSERVÉE.
--
--   B. RÉINTÉGRATION
--      5. Ré-ajouter le même serveur.
--      6. Vérifier : son nom est REVENU dans le sélecteur.
--      7. Requête ci-dessous : is_active = TRUE.
--
--   C. PROMOTION
--      8. Passer un serveur en gérant.
--      9. Vérifier : son nom a disparu du sélecteur, et « Moi (Nom) » reste
--         disponible quand il tient lui-même la caisse.
--     10. Requête ci-dessous : ligne SUPPRIMÉE.
--
--   D. RÉEMBAUCHE HOMONYME (le cas que la migration débloque)
--     11. Après A, créer un nouveau compte portant EXACTEMENT le même nom.
--     12. L'ajouter comme serveur au même bar.
--     13. ATTENDU : succès. Avant cette migration → « Le nom X est déjà utilisé ».
--
-- Requête de suivi (remplacer le nom du bar) :
--
-- SELECT snm.server_name, snm.is_active, snm.updated_at, bm.role, bm.is_active AS membre_actif
-- FROM public.server_name_mappings snm
-- JOIN public.bars b ON b.id = snm.bar_id
-- LEFT JOIN public.bar_members bm ON bm.bar_id = snm.bar_id AND bm.user_id = snm.user_id
-- WHERE b.name = '<NOM DU BAR DE TEST>'
-- ORDER BY snm.server_name;


-- =====================================================
-- GRILLE DE CERTIFICATION
-- =====================================================
--  1. colonne is_active présente ............................ [ ]
--  2. trigger trg_sync_server_mapping actif ................. [ ]
--  3. mappings_actifs_non_serveurs = 0 ...................... [ ]
--  4. bloc 4 VIDE (aucun mapping de manager) ................ [ ]
--  5. 3 mappings désactivés, conformes au diagnostic ........ [ ]
--  6. bloc 6 VIDE (aucun bon orphelin) ...................... [ ]
--  7. search_path conservé + les 2 correctifs présents ...... [ ]
--  8. anon sans EXECUTE ..................................... [ ]
--  9. index partiel créé .................................... [ ]
-- 10. smoke-tests A/B/C/D via l'UI .......................... [ ]
--
-- Tant que 10 n'est pas fait, la migration n'est pas certifiée : les blocs
-- 1-9 prouvent l'état du schéma, pas le comportement réel de la caisse.
-- =====================================================
