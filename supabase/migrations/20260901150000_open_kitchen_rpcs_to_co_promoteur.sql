-- ===================================================================
-- MIGRATION: Ouverture des RPC cuisine + achats au rôle co_promoteur
-- DATE: 2026-09-01
-- AUTHOR: AI Assistant
-- PHASE: Étape 5/8 du chantier co-promoteur
-- ORDRE: 5/8 — APRÈS 20260901140000 (RLS métier)
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ OBJET                                                           │
-- └─────────────────────────────────────────────────────────────────┘

-- Décision du 01/09/2026 : le co-promoteur agit sur le module restauration
-- « comme le promoteur ». Motif : le GÉRANT a déjà tous ces droits — un
-- co-promoteur plus limité qu'un gérant serait incohérent avec la définition
-- retenue (« gérant augmenté »).
--
-- + REVOKE de anon sur convert_purchase_order_to_supplies (voir §ANOMALIE).

-- ⭐ RELEVÉ EN PROD le 01/09/2026 (pg_get_functiondef, pas les fichiers).
--    Le périmètre RÉEL diffère nettement de l'inventaire tiré des fichiers :
--
--    ⚠️ 3 RPC SORTENT du périmètre — leur `NOT IN` filtre des STATUTS, pas
--       des rôles. L'inventaire du pré-0 les avait classés à tort :
--         · cancel_kitchen_item  → NOT IN ('ingredient_shortage', …)  motifs
--         · close_batch          → NOT IN ('closed','discarded',…)    statuts
--
--    ⛔ RECTIFICATIF (01/09/2026, skill code-review) — `cancel_kitchen_item`
--       porte DEUX `NOT IN` : celui des motifs (vu ici) ET, plus bas dans le
--       corps, un vrai contrôle de rôle
--       `v_role NOT IN ('super_admin','promoteur','gerant')` pour l'annulation
--       après `ready`. Mon relevé n'avait extrait que la PREMIÈRE occurrence
--       et l'a exclue à tort. Elle est traitée par `20260901170000`.
--       ⭐ LEÇON : `substring(... from 'NOT IN \([^)]*\)')` ne rend que la
--       PREMIÈRE correspondance. Sur une fonction longue, compter les
--       occurrences AVANT de conclure.
--
--    ⚠️ 1 RPC N'EXISTE PAS en production : `kitchen_supply_expense`
--       (présent dans 20260809230000). 6e divergence fichiers/prod du chantier.
--
--    → PÉRIMÈTRE RÉEL : **8 fonctions** (7 en `NOT IN` + 1 en `IN`),
--      contre 12 annoncées par l'inventaire.

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ LES 8 FONCTIONS TRAITÉES                                        │
-- └─────────────────────────────────────────────────────────────────┘

--   Forme NOT IN (échec fermé) — 7 fonctions :
--     consume_ingredients_fefo      ('super_admin','promoteur','gerant','cuisinier')
--     receive_ingredient_supply     idem
--     record_lot_counts             idem
--     replace_dish_price_options    idem
--     replace_ingredient_sizes      idem
--     set_price_option_size         idem
--     recover_cancelled_dish        ('super_admin','promoteur','gerant')
--
--   Forme IN (positive) — 1 fonction :
--     convert_purchase_order_to_supplies  get_user_role(...) IN ('promoteur','gerant')
--     ⭐ module ACHATS, pas cuisine : dans le périmètre quoi qu'il arrive,
--       le gérant y a déjà accès.

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ MÉTHODE — substitution sur le corps réel, pas de réécriture      │
-- └─────────────────────────────────────────────────────────────────┘

-- Même principe qu'à l'étape 4b : on lit `pg_get_functiondef`, on substitue
-- UNIQUEMENT le motif de rôle, on ré-exécute. Le reste du corps — parfois
-- plusieurs centaines de lignes — est conservé AU CARACTÈRE PRÈS.
--
-- Réécrire 8 corps à la main garantirait une divergence tôt ou tard.
--
-- ⚠️ 4 FORMES d'écriture coexistent en prod (espaces variables) :
--      NOT IN ('super_admin', 'promoteur', 'gerant', 'cuisinier')   (espaces)
--      NOT IN ('super_admin','promoteur','gerant','cuisinier')      (sans)
--      NOT IN ('super_admin','promoteur','gerant')
--      IN ('promoteur', 'gerant')
--
--    ⭐ Elles sont toutes couvertes par **2 règles seulement**, ciblant le
--    couple minimal `'promoteur'` + `'gerant'` (avec / sans espaces) — présent
--    dans les 4 formes et incapable de se chevaucher avec lui-même.
--    Voir le commentaire « SUBSTITUTION NON AMBIGUE » dans le corps : la 1re
--    version, calquée sur les listes complètes, avait des règles qui se
--    chevauchaient (forme C sous-chaîne de forme B).
--
-- 🛡️ GRANTS — `CREATE OR REPLACE` PERD les privilèges (mémoire
--    `project_rpc_security_hardening`). État relevé en prod, à RESTAURER
--    à l'identique :
--      · les 7 RPC cuisine : anon=false, authenticated=true, **service_role=FALSE**
--        ⚠ `svc=false` est VOULU (même choix que add_bar_member_v2) : ces RPC
--          sont appelés depuis l'UI authentifiée, jamais par SyncManager.
--      · convert_purchase_order_to_supplies : anon=TRUE (anomalie, voir ci-dessous),
--        authenticated=true, service_role=true.

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 🛡️ ANOMALIE CORRIGÉE — anon sur convert_purchase_order_to_supplies│
-- └─────────────────────────────────────────────────────────────────┘

-- Cette fonction est la SEULE des 11 relevées à être exécutable par `anon`
-- (`has_function_privilege('anon', …) = true`), alors qu'elle ÉCRIT dans le
-- stock (crée des `supplies`, met à jour `purchase_orders`).
--
-- ⭐ NON EXPLOITABLE aujourd'hui — vérifié sur le corps réel : elle contrôle
--    l'appelant AVANT d'écrire (`get_user_role(v_order.bar_id) IN (…)` puis
--    `p_user_id <> auth.uid()`). Un appelant anon a `auth.uid() = NULL` →
--    `get_user_role()` renvoie NULL → le garde rejette.
--
-- ⚠️ MAIS ce garde devient le SEUL rempart. Une modification future qui le
--    toucherait ouvrirait la fonction à `anon` sans que rien ne le signale.
--    → REVOKE de `anon`, défense en profondeur. Sans risque : l'application
--      appelle ce RPC en `authenticated`, jamais en `anon`.

-- IMPACT: aucune donnée. Aucun co_promoteur n'existe encore.
-- BREAKING_CHANGE: NO — additif (une valeur de rôle en plus), sauf le REVOKE
--   de `anon` qui retire un privilège qu'aucun flux légitime n'utilise.

-- ROLLBACK_STRATEGY:
--   Restaurer depuis l'archive du pré-vol 2 (corps complets AVANT modification).
--   Pour le REVOKE seul : GRANT EXECUTE ON FUNCTION
--     public.convert_purchase_order_to_supplies(uuid, jsonb, uuid) TO anon;
--   ⚠ Rétablirait l'anomalie — ne le faire qu'en cas de régression avérée.

-- TABLES_MODIFIED: aucune · RLS_CHANGES: aucune
-- FUNCTIONS_MODIFIED: 8 (corps : motif de rôle uniquement) + 1 REVOKE

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL — à exécuter AVANT                                      │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) Les 8 fonctions existent et AUCUNE ne connaît encore co_promoteur :
--
--    SELECT proname,
--           (pg_get_functiondef(oid) ILIKE '%co_promoteur%') AS deja_ouvert
--    FROM pg_proc WHERE pronamespace='public'::regnamespace
--      AND proname IN ('consume_ingredients_fefo','receive_ingredient_supply',
--                      'record_lot_counts','replace_dish_price_options',
--                      'replace_ingredient_sizes','set_price_option_size',
--                      'recover_cancelled_dish','convert_purchase_order_to_supplies');
--    -- ATTENDU : 8 lignes, TOUTES `deja_ouvert = false`
--
-- 2) ⭐ ARCHIVE DE ROLLBACK — corps complets AVANT (NE PAS SAUTER) :
--
--    SELECT proname, pg_get_functiondef(oid) FROM pg_proc
--    WHERE pronamespace='public'::regnamespace AND proname IN ( … idem … );
--    -- Sauvegarder hors base. Ces corps font plusieurs centaines de lignes.
--
-- 3) Privilèges AVANT (référence du post-vol) :
--
--    SELECT proname,
--           has_function_privilege('anon',          oid,'EXECUTE') AS anon,
--           has_function_privilege('authenticated', oid,'EXECUTE') AS auth_role,
--           has_function_privilege('service_role',  oid,'EXECUTE') AS svc
--    FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ( … );
--    -- ATTENDU : les 7 cuisine → anon=false, auth=true, svc=FALSE
--    --           convert_purchase_order → anon=TRUE, auth=true, svc=true

BEGIN;

DO $$
DECLARE
  r           RECORD;
  v_def       TEXT;
  v_new       TEXT;
  v_traitees  INT := 0;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN (
        'consume_ingredients_fefo','receive_ingredient_supply','record_lot_counts',
        'replace_dish_price_options','replace_ingredient_sizes','set_price_option_size',
        'recover_cancelled_dish','convert_purchase_order_to_supplies')
    ORDER BY p.proname
  LOOP
    v_def := pg_get_functiondef(r.oid);

    -- Deja traite (idempotence)
    IF v_def ILIKE '%co_promoteur%' THEN
      RAISE NOTICE '[5] % : deja ouvert, ignore', r.proname;
      CONTINUE;
    END IF;

    v_new := v_def;

    -- 🛡️ SUBSTITUTION NON AMBIGUE (corrigee en revue, 01/09/2026).
    --
    --   La 1re version utilisait 4 regles calquees sur les listes completes.
    --   PROBLEME : elles se CHEVAUCHENT — la forme
    --     'super_admin','promoteur','gerant'              (C)
    --   est une SOUS-CHAINE de
    --     'super_admin','promoteur','gerant','cuisinier'  (B)
    --   Verifie en prod : 4 fonctions comptent 1 occurrence de CHACUNE
    --   (record_lot_counts, replace_dish_price_options, replace_ingredient_sizes,
    --    set_price_option_size). Le resultat aurait ete correct PAR ACCIDENT,
    --   grace a l'ordre d'application — une justesse qui casse au premier
    --   changement de forme.
    --
    --   On cible donc le COUPLE MINIMAL 'promoteur' + 'gerant', qui apparait
    --   dans les 4 formes et ne peut se chevaucher avec lui-meme. Deux regles
    --   suffisent (avec / sans espaces), validees sur les 4 formes reelles.
    v_new := replace(v_new, '''promoteur'', ''gerant''',
                            '''promoteur'', ''co_promoteur'', ''gerant''');
    v_new := replace(v_new, '''promoteur'',''gerant''',
                            '''promoteur'',''co_promoteur'',''gerant''');

    -- 🛡️ Aucune substitution n'a pris : motif inconnu, on ARRETE.
    IF v_new = v_def THEN
      RAISE EXCEPTION
        'Motif de role non reconnu dans % — aucune substitution appliquee. '
        'Migration interrompue : traiter cette fonction a la main.', r.proname;
    END IF;

    EXECUTE v_new;
    v_traitees := v_traitees + 1;

    -- Controle immediat : presence ET absence de double insertion.
    IF pg_get_functiondef(r.oid) NOT ILIKE '%co_promoteur%' THEN
      RAISE EXCEPTION 'Fonction % recreee SANS co_promoteur. Migration interrompue.', r.proname;
    END IF;

    -- 🛡️ Anti double-insertion : 'co_promoteur' ne doit JAMAIS apparaitre deux
    --   fois de suite dans une meme liste (signe d'un chevauchement de regles).
    IF pg_get_functiondef(r.oid) ILIKE '%co_promoteur%co_promoteur%'
       AND (length(pg_get_functiondef(r.oid))
            - length(replace(pg_get_functiondef(r.oid), '''co_promoteur''', ''))) 
           / length('''co_promoteur''') > 2 THEN
      RAISE EXCEPTION
        'Fonction % : ''co_promoteur'' insere plus de 2 fois — chevauchement de '
        'regles suspecte. Migration interrompue.', r.proname;
    END IF;

    RAISE NOTICE '[5] % (%) : ouvert au co_promoteur', r.proname, r.args;
  END LOOP;

  IF v_traitees = 0 THEN
    RAISE NOTICE '[5] Aucune fonction a modifier — migration DEJA APPLIQUEE (idempotent).';
  ELSIF v_traitees <> 8 THEN
    RAISE EXCEPTION
      'ATTENDU 8 fonctions traitees, %. L''etat de la base diverge du releve du '
      '01/09/2026 — migration interrompue, refaire le releve.', v_traitees;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- RESTAURATION DES GRANTS — CREATE OR REPLACE les a perdus
-- ═══════════════════════════════════════════════════════════════════
-- État relevé en prod le 01/09/2026, reproduit à l'identique.
-- ⚠ `service_role` reste FAUX sur les 7 RPC cuisine : c'est un choix, pas un
--   oubli (appels depuis l'UI authentifiée uniquement). Le REVOKE FROM PUBLIC
--   le garantit, service_role héritant de PUBLIC.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN (
        'consume_ingredients_fefo','receive_ingredient_supply','record_lot_counts',
        'replace_dish_price_options','replace_ingredient_sizes','set_price_option_size',
        'recover_cancelled_dish')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon',
                   r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated',
                   r.proname, r.args);
  END LOOP;

  -- convert_purchase_order_to_supplies : service_role CONSERVÉ (true en prod),
  -- mais 🛡️ anon RETIRÉ (anomalie — voir §ANOMALIE en tête de fichier).
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname = 'convert_purchase_order_to_supplies'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon',
                   r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role',
                   r.proname, r.args);
  END LOOP;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL — à exécuter APRÈS                                     │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) Les 8 fonctions connaissent le rôle :
--
--    SELECT proname, (pg_get_functiondef(oid) ILIKE '%co_promoteur%') AS ouvert
--    FROM pg_proc WHERE pronamespace='public'::regnamespace
--      AND proname IN ('consume_ingredients_fefo','receive_ingredient_supply',
--                      'record_lot_counts','replace_dish_price_options',
--                      'replace_ingredient_sizes','set_price_option_size',
--                      'recover_cancelled_dish','convert_purchase_order_to_supplies');
--    -- ATTENDU : 8 lignes, TOUTES `ouvert = true`
--
-- 2) 🛡️ PRIVILÈGES — le point critique (CREATE OR REPLACE les perd) :
--
--    SELECT proname,
--           has_function_privilege('anon',          oid,'EXECUTE') AS anon,
--           has_function_privilege('authenticated', oid,'EXECUTE') AS auth_role,
--           has_function_privilege('service_role',  oid,'EXECUTE') AS svc
--    FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ( … idem … )
--    ORDER BY proname;
--    -- ATTENDU : les 7 cuisine       → anon=false, auth=true, svc=FALSE
--    --           convert_purchase_order → anon=**FALSE** (corrigé), auth=true, svc=true
--    -- ⛔ Tout `anon = true` restant : ARRÊTER et signaler.
--
-- 3) ⭐ Les whitelists contiennent bien les 2 rôles, et n'ont RIEN perdu :
--
--    SELECT proname, substring(pg_get_functiondef(oid) from '(NOT )?IN \([^)]*promoteur[^)]*\)') AS whitelist
--    FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ( … idem … )
--    ORDER BY proname;
--    -- ATTENDU : chaque whitelist contient `promoteur` ET `co_promoteur`,
--    --           ainsi que `gerant` / `cuisinier` / `super_admin` d'origine.
--
-- 4) NON-RÉGRESSION depuis l'UI (bar avec restauration active) :
--      · gérant   → réceptionner un approvisionnement d'ingrédients → OK
--      · cuisinier→ consommer des ingrédients, clôturer un lot      → OK
--      · gérant   → convertir une commande fournisseur en stock     → OK
--    Ces flux ne doivent PAS avoir changé.

-- ⚠ RAPPEL : après cette étape il reste le bot WhatsApp (6), puis
--    `create_sale_idempotent` **hors service** (7), puis le front (8).
--    Le co-promoteur ne peut TOUJOURS PAS encaisser.
