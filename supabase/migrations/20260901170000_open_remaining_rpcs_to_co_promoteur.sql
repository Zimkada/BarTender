-- ===================================================================
-- MIGRATION: Ouverture des RPC RESTANTS au rôle co_promoteur
-- DATE: 2026-09-01
-- AUTHOR: AI Assistant
-- PHASE: Correctif de l'étape 5 — trouvé par le skill code-review
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ ⛔ LE DÉFAUT DE MÉTHODE QUI A RENDU CETTE MIGRATION NÉCESSAIRE   │
-- └─────────────────────────────────────────────────────────────────┘

-- L'étape 4b réécrivait les policies par une BOUCLE GÉNÉRIQUE sur `pg_policies`.
-- Elle donnait une impression de complétude — mais elle ne peut STRUCTURELLEMENT
-- PAS atteindre les corps de FONCTIONS. Pour celles-ci, j'ai énuméré à la main
-- une liste de 8 RPC (étape 5)… et j'en ai manqué 19.
--
-- ⛔ SYMPTÔME — le pire possible, et exactement le défaut n°2 que la
--    certification du plan avait identifié au tout début du chantier :
--      · la permission est accordée (`ROLE_PERMISSIONS`) ;
--      · la policy RLS est ouverte (étape 4b) ;
--      · donc **l'interface propose l'action** ;
--      · et le RPC la refuse **au moment de la soumission**.
--
-- ⭐ LEÇON — un balayage de rôle doit partir de `pg_proc` autant que de
--    `pg_policies`. Le pré-0 ne l'avait fait que pour les whitelists `NOT IN`
--    identifiées à l'avance : une recherche fondée sur ce qu'on croit déjà
--    savoir ne trouve rien de nouveau.

-- ⭐ RELEVÉ EXHAUSTIF EN PROD (01/09/2026) — `pg_proc`, toutes formes :
--    37 fonctions mentionnent 'promoteur' sans 'co_promoteur'.
--    → 19 sont des CONTRÔLES D'ACCÈS réels (traitées ici)
--    → 18 sont des commentaires, du texte, ou volontairement laissées (§EXCLUES)

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ LES 19 FONCTIONS TRAITÉES                                       │
-- └─────────────────────────────────────────────────────────────────┘

--  A. `IN ('promoteur','gerant')` — le GÉRANT les a déjà, donc le co-promoteur
--     (« gérant augmenté ») doit les avoir. Aucune décision produit nouvelle :
--       approve_return · reject_return · manual_restock_return
--       claim_consignment · create_consignment · forfeit_consignment
--       create_supply_and_update_product · close_partial_purchase_order
--       check_product_create_permission · reject_sale · validate_sale
--       get_my_subscription_status
--
--  B. `= 'promoteur'` SEUL — le gérant ne les a PAS. Décision du fondateur
--     (01/09/2026) : **ouvrir les trois**.
--       create_stock_adjustment   → déjà tranché « oui » à l'étape 4b ; sans le
--                                   RPC, la policy INSERT ouverte rendait le
--                                   bouton actif pour une action qui échouait.
--       reverse_supply            → ⛔ `ProductHistoryModal.tsx:56` garde sur
--                                   `canManageExpenses` PRÉCISÉMENT parce que
--                                   cette permission avait le même profil que ce
--                                   RPC. L'accorder au co-promoteur a rompu
--                                   l'alignement : bouton actif, RPC refuse.
--       update_supply_metadata    → même famille (corriger un appro).
--
--  C. CUISINE — oubliées à l'étape 5 :
--       cancel_kitchen_item  → son 1er `NOT IN` porte des MOTIFS d'annulation ;
--                              le relevé n'avait vu que celui-là et l'avait
--                              classée « hors périmètre ». Son contrôle de RÔLE
--                              est plus loin dans le corps.
--       discard_ingredient_lot → ⚠️ RECTIFIE (4e revue) : mon commentaire
--                                parlait d'un « faux positif silencieux » de
--                                l'etape 5. C'est FAUX — verifie : elle ne
--                                figure PAS dans la liste des 8 de 150000,
--                                elle n'a simplement jamais ete enumeree.
--                                J'avais invente une explication a un fait
--                                non verifie.

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ ⛔ VOLONTAIREMENT EXCLUES                                        │
-- └─────────────────────────────────────────────────────────────────┘

--   is_promoteur_or_admin        → faille connue (pas de filtre bar_id), à
--                                  auditer séparément. NE PAS étendre.
--   setup_promoter_bar           → création de bars (`canCreateBars: false`)
--   add_bar_member_v2            → ⛔ VERROU DE GOUVERNANCE (décision n°4) :
--   add_bar_member_existing         la nomination reste au SuperAdmin
--   check_user_can_manage_members
--   remove_bar_member_v2         → protège promoteur/super_admin du retrait
--   resolve_wa_bar_link          → bot WhatsApp, étape 6 REPORTÉE
--   request_wa_bar_link          → idem
--   can_write_kitchen            → simple commentaire (pas un guard de rôle)
--   cancel_sale, get_bar_members, get_bar_products, get_bar_period_stats,
--   get_kitchen_losses, get_top_products_aggregated, close_batch,
--   admin_generate_bar_report, get_my_staff_candidates,
--   sync_server_mapping_on_member_change
--                                → mentions en COMMENTAIRE uniquement, ou
--                                  contrôle par `is_bar_member` (sans rôle).

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ MÉTHODE — 5 règles couvrant TOUTES les formes relevées           │
-- └─────────────────────────────────────────────────────────────────┘

--   'promoteur', 'gerant'   → + 'co_promoteur'   (avec espaces)
--   'promoteur','gerant'    → + 'co_promoteur'   (sans espaces)
--   'gerant', 'promoteur'   → + 'co_promoteur'   (ordre inverse, reject_sale)
--   'gerant','promoteur'    → + 'co_promoteur'
--   = 'promoteur'           → = ANY (ARRAY['promoteur','co_promoteur'])
--
-- ⭐ Chaque règle cible un motif MINIMAL NON AMBIGU — leçon des 3 chevauchements
--   rencontrés sur ce chantier ('promoteur' est une sous-chaîne de
--   'co_promoteur' ; la forme courte est une sous-chaîne de la longue).
--   La règle `= 'promoteur'` s'applique en DERNIER : les listes sont traitées
--   avant, donc elle ne peut plus toucher l'intérieur d'un ARRAY.

-- BREAKING_CHANGE: NO — additif. Aucun rôle existant ne perd l'accès.
-- ROLLBACK_STRATEGY: restaurer depuis l'archive du pré-vol 2.
-- TABLES_MODIFIED: aucune · RLS_CHANGES: aucune
-- FUNCTIONS_MODIFIED: 19 (motif de rôle uniquement)

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL — la liste est ECRITE ICI, ne pas la retranscrire        │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ⚠️ CORRIGE (5e revue) : ce bloc renvoyait a « … les 18 ci-dessous … » sans
--    jamais ecrire la liste, forcant la transcription a la main que le post-vol
--    interdit par ailleurs. Risque reel : une ARCHIVE DE ROLLBACK INCOMPLETE
--    sur le RPC des ventes et 18 autres. La voici, a copier telle quelle :
--
--    WITH cibles AS (SELECT unnest(ARRAY[
--      'approve_return','reject_return','manual_restock_return',
--      'claim_consignment','create_consignment','forfeit_consignment',
--      'create_supply_and_update_product','close_partial_purchase_order',
--      'check_product_create_permission','reject_sale','validate_sale',
--      'get_my_subscription_status','create_stock_adjustment','reverse_supply',
--      'update_supply_metadata','cancel_sale','cancel_kitchen_item',
--      'discard_ingredient_lot','can_write_kitchen'
--    ]) AS nom)
--
-- 1) COUVERTURE + doublons + privileges AVANT :
--
--    SELECT '1-COUVERTURE' AS v, 'attendu 19' AS o, count(DISTINCT p.proname)::text AS d
--      FROM cibles c JOIN pg_proc p ON p.proname=c.nom
--       AND p.pronamespace='public'::regnamespace
--    UNION ALL
--    SELECT '2-DEJA-OUVERTES','attendu 0', count(*)::text
--      FROM cibles c JOIN pg_proc p ON p.proname=c.nom
--       AND p.pronamespace='public'::regnamespace
--     WHERE pg_get_functiondef(p.oid) ILIKE '%co_promoteur%'
--    UNION ALL
--    SELECT '3-SURCHARGES', p.proname, count(*)::text
--      FROM cibles c JOIN pg_proc p ON p.proname=c.nom
--       AND p.pronamespace='public'::regnamespace
--     GROUP BY p.proname HAVING count(*)>1
--    UNION ALL
--    SELECT '4-PRIVILEGES', p.proname,
--           'anon='||has_function_privilege('anon',p.oid,'EXECUTE')::text
--        ||' auth='||has_function_privilege('authenticated',p.oid,'EXECUTE')::text
--        ||' svc=' ||has_function_privilege('service_role',p.oid,'EXECUTE')::text
--      FROM cibles c JOIN pg_proc p ON p.proname=c.nom
--       AND p.pronamespace='public'::regnamespace
--    ORDER BY 1,2;
--
--    -- ATTENDU : couverture=19 · deja-ouvertes=0 · AUCUNE surcharge
--    -- ⭐ Les 19 lignes '4-PRIVILEGES' sont la REFERENCE du post-vol.
--    --   Baseline connue : 15 a anon=TRUE, 4 a anon=FALSE
--    --   (get_my_subscription_status, cancel_kitchen_item,
--    --    discard_ingredient_lot, can_write_kitchen).
--
-- 2) ⭐ ARCHIVE DE ROLLBACK — corps ET commentaires (NE PAS SAUTER) :
--
--    SELECT p.proname, pg_get_functiondef(p.oid) AS corps,
--           obj_description(p.oid,'pg_proc') AS commentaire
--      FROM cibles c JOIN pg_proc p ON p.proname=c.nom
--       AND p.pronamespace='public'::regnamespace
--     ORDER BY p.proname;
--    -- ATTENDU : 19 lignes. Sauvegarder hors base.

BEGIN;

DO $$
DECLARE
  r          RECORD;
  v_def      TEXT;
  v_new      TEXT;
  v_traitees INT := 0;
  v_deja     INT := 0;
  v_comment  TEXT;   -- 🛡️ F3 : CREATE OR REPLACE perd le COMMENT ON FUNCTION
  v_anon     BOOLEAN; -- 🛡️ F2 : privileges RESTAURES a l'identique
  v_auth     BOOLEAN;
  v_svc      BOOLEAN;
  v_nb       INT;
  v_manquantes TEXT;

  c_cibles CONSTANT TEXT[] := ARRAY[
    -- A. IN ('promoteur','gerant') — le gérant les a déjà
    'approve_return','reject_return','manual_restock_return',
    'claim_consignment','create_consignment','forfeit_consignment',
    'create_supply_and_update_product','close_partial_purchase_order',
    'check_product_create_permission','reject_sale','validate_sale',
    'get_my_subscription_status',
    -- ⛔ `prepare_subscription_checkout` RETIRÉ (skill code-review, CRITIQUE) :
    --    il est service_role ONLY par conception et fait confiance à
    --    `p_caller_id` — un paramètre fourni par l'appelant — PARCE QUE seule
    --    une Edge Function ayant déjà validé le JWT peut l'invoquer
    --    (20260717000000:86-87 : REVOKE FROM PUBLIC, anon, authenticated).
    --    L'ouvrir à `authenticated` aurait permis à tout compte connecté de
    --    passer l'UUID d'un promoteur et de lire le plan, le montant et les
    --    impayés de N'IMPORTE QUEL bar. Le co-promoteur y accède via l'Edge
    --    Function, comme le promoteur — rien à changer ici.
    -- B. = 'promoteur' seul — décision fondateur du 01/09/2026
    'create_stock_adjustment','reverse_supply','update_supply_metadata',
    -- C. cuisine, oubliées à l'étape 5
    'cancel_kitchen_item','discard_ingredient_lot',
    -- ⭐ AJOUTE EN 3e REVUE (skill) : garde reel `= 'promoteur'`. Coherent avec
    --    la policy `sales | Promoteurs can cancel validated sales` ouverte a
    --    l'etape 4b, et avec `canCancelSales: true`.
    'cancel_sale',
    -- ⭐⭐ AJOUTE EN 3e REVUE (skill) — LA PLUS IMPACTANTE : liste blanche
    --    `AND role IN ('super_admin','promoteur','gerant','cuisinier')`
    --    alimentant **20 points d'usage** (carte, recettes, ingredients).
    --    Classee a tort « simple commentaire » : l'extrait de 180 caracteres
    --    tombait sur un bloc de doc, le garde etant 30 lignes plus bas.
    --    Sans elle ces ecrans seraient EN LECTURE SEULE pour un co-promoteur
    --    ayant pourtant canManageRecipes et canManageIngredientStock.
    'can_write_kitchen'
  ];
BEGIN
  -- 🛡️ GARDE 0 (skill) — le nombre attendu DERIVE du tableau : impossible que
  --   les deux divergent lors d'une future edition (c'est deja arrive :
  --   une entree retiree en revue laissait la constante a 18).
  v_nb := array_length(c_cibles, 1);
  IF v_nb <> 19 THEN
    RAISE EXCEPTION 'c_cibles contient % noms, 19 attendus — incoherence.', v_nb;
  END IF;

  -- 🛡️ GARDE 0bis (skill) — SURCHARGES. Les migrations soeurs 160000 et
  --   20260811170000 verifient explicitement qu'une seule signature existe.
  --   Sans ce controle, une signature obsolete sur UNE cible ferait echouer la
  --   transaction ENTIERE : 18 fonctions correctes appliquees comme zero.
  SELECT string_agg(t.proname || ' (' || t.n || ' versions)', ', ' ORDER BY t.proname)
  INTO v_manquantes
  FROM (
    SELECT p.proname, count(*) AS n
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname = ANY (c_cibles)
    GROUP BY p.proname HAVING count(*) > 1
  ) t;

  IF v_manquantes IS NOT NULL THEN
    RAISE EXCEPTION
      'Surcharge(s) detectee(s) : %. On ne devine pas laquelle l''application '
      'appelle — migration interrompue.', v_manquantes;
  END IF;

  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname = ANY (c_cibles)
    ORDER BY p.proname
  LOOP
    v_def := pg_get_functiondef(r.oid);

    -- 🛡️ IDEMPOTENCE testee sur les LIGNES DE CODE, pas sur le texte entier
    --   (skill, 5e revue). `ILIKE '%co_promoteur%'` sur `pg_get_functiondef`
    --   teste la PRESENCE DU JETON : une fonction mentionnant le role dans un
    --   COMMENTAIRE serait sautee ici, son garde jamais elargi, et la
    --   couverture finale la validerait quand meme. C'est exactement le mode
    --   de defaillance qui a fait manquer `can_write_kitchen` pendant 3 revues.
    SELECT count(*) INTO v_nb
    FROM unnest(string_to_array(v_def, chr(10))) AS ligne
    WHERE ligne ILIKE '%co_promoteur%'
      AND trim(ligne) NOT LIKE '--%'
      AND trim(ligne) NOT LIKE '*%'
      AND trim(ligne) NOT LIKE '/*%';

    IF v_nb > 0 THEN
      v_deja := v_deja + 1;
      RAISE NOTICE '[correctif] % : deja ouvert (garde), ignore', r.proname;
      CONTINUE;
    END IF;

    v_new := v_def;

    -- Listes d'abord (motifs les plus specifiques)...
    v_new := replace(v_new, '''promoteur'', ''gerant''',
                            '''promoteur'', ''co_promoteur'', ''gerant''');
    v_new := replace(v_new, '''promoteur'',''gerant''',
                            '''promoteur'',''co_promoteur'',''gerant''');
    v_new := replace(v_new, '''gerant'', ''promoteur''',
                            '''gerant'', ''promoteur'', ''co_promoteur''');
    v_new := replace(v_new, '''gerant'',''promoteur''',
                            '''gerant'',''promoteur'',''co_promoteur''');
    -- ...puis l'egalite simple, EN DERNIER : les listes sont deja traitees,
    -- cette regle ne peut donc plus toucher l'interieur d'un ARRAY.
    v_new := replace(v_new, '= ''promoteur''',
                            '= ANY (ARRAY[''promoteur'',''co_promoteur''])');

    IF v_new = v_def THEN
      RAISE EXCEPTION
        'Motif de role non reconnu dans % — aucune substitution appliquee. '
        'Migration interrompue : traiter cette fonction a la main.', r.proname;
    END IF;

    -- 🛡️ ANTI-SUR-SUBSTITUTION. La regle `= 'promoteur'` est un replace() NON
    --   ANCRE : elle reecrit TOUTE occurrence du corps, pas seulement le garde
    --   d'acces. Un corps portant plusieurs comparaisons (dont une
    --   volontairement plus stricte) serait elargi en silence.
    v_nb := (length(v_new) - length(replace(v_new, '''co_promoteur''', '')))
            / length('''co_promoteur''');
    -- 🛡️ Le releve FIABLE a etabli que chacune des 19 cibles n'a qu'UN SEUL
    --   garde de role → exactement 1 insertion. Le seuil « max 2 » du 2e jet
    --   laissait passer le cas a 2 qu'il visait (skill).
    IF v_nb <> 1 THEN
      RAISE EXCEPTION
        'Fonction % : % insertions de ''co_promoteur'' (1 attendue). '
        'Le corps en prod differe du releve — migration interrompue.', r.proname, v_nb;
    END IF;

    -- 🛡️ F3 (skill) — capturer COMMENT + service_role AVANT le remplacement.
    v_comment := obj_description(r.oid, 'pg_proc');
    v_anon    := has_function_privilege('anon', r.oid, 'EXECUTE');
    v_auth    := has_function_privilege('authenticated', r.oid, 'EXECUTE');
    v_svc     := has_function_privilege('service_role', r.oid, 'EXECUTE');

    EXECUTE v_new;
    v_traitees := v_traitees + 1;

    SELECT count(*) INTO v_nb
    FROM unnest(string_to_array(pg_get_functiondef(r.oid), chr(10))) AS ligne
    WHERE ligne ILIKE '%co_promoteur%'
      AND trim(ligne) NOT LIKE '--%' AND trim(ligne) NOT LIKE '*%'
      AND trim(ligne) NOT LIKE '/*%';

    IF v_nb = 0 THEN
      RAISE EXCEPTION
        'Fonction % recreee sans co_promoteur DANS SON CODE. Interrompu.', r.proname;
    END IF;

    -- Restauration du COMMENT (F3).
    IF v_comment IS NOT NULL THEN
      EXECUTE format('COMMENT ON FUNCTION public.%I(%s) IS %L',
                     r.proname, r.args, v_comment);
    END IF;

    -- 🛡️ F2 (skill) — RESTAURER les privileges A L'IDENTIQUE, fonction par
    --   fonction. Un GRANT uniforme aurait fait PERDRE service_role a celles
    --   qui l'avaient (Edge Functions, SyncManager) — panne immediate et
    --   silencieuse au COMMIT.
    --
    -- ⛔ REVOKE **CONDITIONNEL** — corrige 2 fois, dans les deux sens.
    --
    --   1er jet : `REVOKE ALL FROM PUBLIC, anon` inconditionnel → aurait DURCI
    --             13 fonctions au passage (hors sujet, cf. plus bas).
    --   2e jet  : aucun REVOKE → ⛔ DEFAUT INVERSE trouve par le skill :
    --             3 cibles avaient un `REVOKE FROM PUBLIC` EXPLICITE issu du
    --             durcissement RPC (get_my_subscription_status,
    --             cancel_kitchen_item, discard_ingredient_lot — les seules a
    --             `anon = false` au pre-vol). Or `CREATE OR REPLACE` remet
    --             `proacl` a NULL : PUBLIC/anon y REGAGNERAIT EXECUTE.
    --             Ne rien revoquer ANNULAIT donc leur durcissement.
    --
    --   → On revoque UNIQUEMENT si la fonction etait DEJA durcie (`anon=false`
    --     releve avant remplacement). Chaque fonction retrouve exactement son
    --     etat d'origine — ni durcie, ni desserree.
    -- ⚠️ AFFINE (4e revue) : `REVOKE ALL FROM PUBLIC, anon` retire AUSSI les
    --   privileges que service_role/authenticated tiendraient de PUBLIC. Les
    --   GRANT conditionnels ci-dessous les retablissent — mais seulement parce
    --   qu'ils sont poses APRES. L'ordre REVOKE puis GRANT est donc STRUCTUREL,
    --   pas cosmetique : l'inverser ferait perdre service_role en silence.
    IF NOT v_anon THEN
      EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon',
                     r.proname, r.args);
    END IF;
    --
    --   POURQUOI PAS DE REVOKE INCONDITIONNEL : 15 des 19 cibles ont
    --   `anon = true`, mais l'ACL reelle (`proacl`) montre qu'anon n'a jamais
    --   recu de GRANT — il HERITE de PUBLIC (`=X/postgres`). Ce n'est pas
    --   ponctuel : **162 fonctions sur 244** du schema sont dans ce cas.
--   ⚠️ Les 4 AUTRES (get_my_subscription_status, cancel_kitchen_item,
--      discard_ingredient_lot, can_write_kitchen) ont un REVOKE EXPLICITE :
--      c'est exactement ce que le REVOKE conditionnel restaure.
    --   Les durcir ici serait un changement de securite glisse dans une
    --   migration d'ouverture de role — il merite sa propre passe
    --   (memoire `project_public_execute_162_fonctions`).
    IF v_auth THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated',
                     r.proname, r.args);
    END IF;
    IF v_svc THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role',
                     r.proname, r.args);
    END IF;

    RAISE NOTICE '[correctif] % (%) : ouvert', r.proname, r.args;
  END LOOP;

  RAISE NOTICE '[correctif] % traitees, % deja ouvertes', v_traitees, v_deja;

  -- 🛡️ F5 (skill) — compter les NOMS DISTINCTS, pas les lignes de pg_proc.
  --   La boucle itere sur les OID : une surcharge ferait grimper le compteur
  --   et une assertion sur (traitees + deja) aurait soit fait echouer un
  --   passage correct, soit — cas symetrique — laisse passer une fonction
  --   reellement absente. C'est la COUVERTURE des 19 noms qui doit etre
  --   verifiee, pas le nombre de corps reecrits.
  SELECT count(*), string_agg(c.nom, ', ' ORDER BY c.nom)
  INTO v_nb, v_manquantes
  FROM unnest(c_cibles) AS c(nom)
  WHERE NOT EXISTS (
    -- 🛡️ Sur les LIGNES DE CODE uniquement (skill, 5e revue) : une mention en
    --   commentaire ne prouve PAS que le garde a ete elargi.
    SELECT 1 FROM pg_proc p
    CROSS JOIN LATERAL unnest(string_to_array(pg_get_functiondef(p.oid), chr(10))) AS ligne
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname = c.nom
      AND ligne ILIKE '%co_promoteur%'
      AND trim(ligne) NOT LIKE '--%'
      AND trim(ligne) NOT LIKE '*%'
      AND trim(ligne) NOT LIKE '/*%'
  );

  IF v_nb > 0 THEN
    -- 🛡️ F5 (skill) — NOMMER ce qui manque. Un simple compteur sous une
    --   transaction annulee laisse l'operateur sans piste : `kitchen_supply_expense`
    --   s'est deja revelee absente de la prod dans ce meme lot.
    RAISE EXCEPTION
      '% fonction(s) NON ouverte(s) : %. Migration interrompue (transaction annulee).',
      v_nb, v_manquantes;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- ⭐ LES GRANTS SONT RESTAURÉS DANS LA BOUCLE CI-DESSUS, fonction par fonction.
-- ═══════════════════════════════════════════════════════════════════
-- ⚠️ PAS de boucle de GRANT globale ici : elle écraserait ce que la boucle
--    vient de restaurer. Un `GRANT TO authenticated` uniforme aurait fait
--    PERDRE `service_role` aux fonctions qui l'avaient — panne immédiate et
--    silencieuse des Edge Functions au COMMIT (défaut trouvé par le skill).
--    Chaque fonction retrouve EXACTEMENT les privilèges qu'elle avait.

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL                                                        │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⭐ COUVERTURE — les 19 connaissent le rôle.
--    ⚠️ CORRIGE (4e revue) : la liste de ce post-vol n'en contenait que 17,
--    en oubliant precisement les 2 ajoutees en dernier — `cancel_sale` et
--    `can_write_kitchen`, les plus impactantes.
--    → NE PAS reecrire la liste a la main. La deriver :
--
--    WITH cibles AS (SELECT unnest(ARRAY[
--      'approve_return','reject_return','manual_restock_return',
--      'claim_consignment','create_consignment','forfeit_consignment',
--      'create_supply_and_update_product','close_partial_purchase_order',
--      'check_product_create_permission','reject_sale','validate_sale',
--      'get_my_subscription_status','create_stock_adjustment','reverse_supply',
--      'update_supply_metadata','cancel_sale','cancel_kitchen_item',
--      'discard_ingredient_lot','can_write_kitchen']) AS nom)
--    SELECT count(*) AS ouvertes,
--           string_agg(c.nom, ', ') FILTER (
--             WHERE NOT EXISTS (SELECT 1 FROM pg_proc p
--               WHERE p.pronamespace='public'::regnamespace AND p.proname=c.nom
--                 AND pg_get_functiondef(p.oid) ILIKE '%co_promoteur%')
--           ) AS non_ouvertes
--    FROM cibles c;
--    -- ATTENDU : ouvertes = 19 · non_ouvertes = NULL
--
-- 2) 🛡️ PRIVILEGES — **IDENTIQUES AU PRE-VOL, ligne par ligne**.
--    ⛔ SURTOUT PAS « anon=false partout » : le REVOKE est CONDITIONNEL.
--    ⚠️ CORRIGE (4e revue) : la baseline annoncait « 14 + 3 » — faux deux fois.
--       `can_write_kitchen` a AUSSI un REVOKE explicite (20260811150000:170-171),
--       ce qui fait **4** fonctions durcies, et 14+3 sommait a 17, pas 19.
--       → Baseline reelle : **15 a anon=TRUE** (heritage PUBLIC, INCHANGE)
--         et **4 a anon=FALSE** (durcissement RESTAURE) :
--           get_my_subscription_status · cancel_kitchen_item ·
--           discard_ingredient_lot · can_write_kitchen
--    ⛔ Toute ligne QUI DIFFERE du pre-vol = anomalie a signaler.
--
-- 3) ⭐ BALAYAGE FINAL — refaire le RELEVE FIABLE (lignes de code, hors
--    commentaires) et verifier qu'il ne reste QUE les exclusions volontaires :
--
--      SELECT p.proname
--      FROM pg_proc p
--      CROSS JOIN LATERAL unnest(string_to_array(pg_get_functiondef(p.oid), chr(10)))
--           WITH ORDINALITY AS l(ligne, n)
--      WHERE p.pronamespace = 'public'::regnamespace
--        AND pg_get_functiondef(p.oid) NOT ILIKE '%co_promoteur%'
--        AND l.ligne ILIKE '%promoteur%'
--        AND trim(l.ligne) NOT LIKE '--%' AND trim(l.ligne) NOT LIKE '*%'
--        AND trim(l.ligne) NOT LIKE '/*%'
--      GROUP BY p.proname ORDER BY 1;
--
--    -- ATTENDU, exactement ces 10 : add_bar_member_existing, add_bar_member_v2,
--    --   check_user_can_manage_members, get_bar_members, is_promoteur_or_admin,
--    --   prepare_subscription_checkout, remove_bar_member_v2,
--    --   request_wa_bar_link, resolve_wa_bar_link, setup_promoter_bar
--    -- ⛔ Tout AUTRE nom = un garde encore oublie.
--
-- 4) NON-RÉGRESSION depuis l'UI : valider une vente, approuver un retour,
--    créer une consignation, saisir un approvisionnement — en tant que GÉRANT.
--    Ces droits ne doivent PAS avoir changé.
