-- ===================================================================
-- MIGRATION: RPC d'ajout/retrait d'un co-promoteur (SuperAdmin)
-- DATE: 2026-09-01
-- AUTHOR: AI Assistant
-- PHASE: Étape 3/8 du chantier co-promoteur
-- ORDRE: 3/8 — APRÈS 20260901090000 (CHECK), AVANT les RLS (étape 4)
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BUSINESS CONTEXT                                                │
-- └─────────────────────────────────────────────────────────────────┘

-- DÉCISION (fondateur, 01/09/2026) — gouvernance de la nomination :
--   * AJOUT   : SuperAdmin UNIQUEMENT. `add_bar_member_v2` n'est PAS ouvert au
--               rôle co_promoteur — un promoteur ne peut pas nommer d'associé
--               depuis la page Équipe.
--   * RETRAIT : promoteur principal OU SuperAdmin. Un co-promoteur ne peut
--               JAMAIS en retirer un autre (pas de révocation hostile entre
--               associés).
--
-- POURQUOI cette asymétrie :
--   Nommer un co-promoteur donne accès aux salaires, à la comptabilité complète,
--   aux apports de capital, et le droit d'annuler des ventes validées. Si un
--   promoteur pouvait le faire depuis son téléphone, la sécurité de toutes ces
--   données ne tiendrait qu'à son mot de passe. C'est une décision de PROPRIÉTÉ,
--   pas de gestion d'équipe — même raisonnement que la création de bars.
--   Le retrait reste ouvert au promoteur : en cas de conflit, il ne doit pas
--   dépendre d'un tiers pour révoquer l'accès.

-- ⭐ CE QUE CETTE MIGRATION NE FAIT **PAS** :
--   Elle NE touche PAS `add_bar_member_v2`. Ce RPC continue de rejeter tout rôle
--   hors ('gerant','serveur') — c'est le comportement VOULU, il constitue le
--   verrou applicatif de la décision ci-dessus. Ne pas le "corriger".

-- ⚠️ RAPPEL — FENÊTRE OUVERTE depuis l'étape 1 (à refermer à l'étape 4) :
--   `bar_members_update_policy` laisse un promoteur produire une ligne de rôle
--   `co_promoteur` par UPDATE direct via l'API REST. Cette migration n'y change
--   rien (c'est une RLS, traitée à l'étape 4). Voir docs/migrations/SUIVI_CO_PROMOTEUR.md.

-- IMPACT:
--   Aucune donnée existante. Deux nouvelles fonctions, rien de modifié.

-- ⚠️ EFFETS DE BORD CONNUS — 3 triggers réagissent aux écritures sur bar_members :
--
--   1. `trg_sync_server_mapping` (AFTER INSERT OR UPDATE, 20260727010000)
--      → sa branche `role <> 'serveur'` fait un **DELETE** de
--        server_name_mappings. C'est pourquoi la GARDE 5bis refuse de promouvoir
--        un serveur (voir son commentaire détaillé dans le corps).
--        Un ex-gérant n'a pas de mapping actif : aucun effet dans le cas nominal.
--
--   2. `trigger_sync_role_to_auth_metadata` / `..._update_...` (20251221)
--      → propagent le rôle dans auth.users.raw_app_meta_data. Ils ne filtrent
--        pas par valeur : `co_promoteur` sera propagé sans modification.
--        ⚠ NON TESTÉ avec une valeur inconnue — à vérifier au 1er ajout réel
--        (un JWT portant un rôle inconnu pourrait être rejeté ailleurs).
--
--   3. `trg_audit_member_change` (AFTER INSERT **OR DELETE**, 20251215)
--      → ne réagit PAS à l'UPDATE. Une promotion gérant→co_promoteur ne laisse
--        donc pas de trace dans cet audit-là. Le journal dédié de l'étape 4
--        (décision n°5) couvrira ce besoin ; ne pas compter sur ce trigger.
--
-- ⚠️ VERROU : `check_plan_member_limit()` pose un `FOR UPDATE` sur la ligne du
--   bar (20260727000000:37). Verrou bref et nominations rares → sans impact,
--   mais c'est la cause à regarder en premier si un blocage apparaît ici.

-- BREAKING_CHANGE: NO — créations pures.

-- ROLLBACK_STRATEGY:
--   DROP FUNCTION IF EXISTS public.add_co_promoteur(UUID, UUID);
--   DROP FUNCTION IF EXISTS public.remove_co_promoteur(UUID, UUID);
--   (aucune donnée à restaurer ; les membres créés restent en place)

-- TABLES_MODIFIED: aucune (INSERT/UPDATE de données uniquement à l'exécution)
-- FUNCTIONS_CREATED: add_co_promoteur, remove_co_promoteur · RLS_CHANGES: aucune

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL — à exécuter AVANT                                      │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) L'étape 1 est bien passée (sinon l'INSERT violera le CHECK) :
--
--    SELECT pg_get_constraintdef(oid) ILIKE '%co_promoteur%' AS etape1_ok
--    FROM pg_constraint
--    WHERE conrelid = 'public.bar_members'::regclass AND contype = 'c'
--      AND pg_get_constraintdef(oid) ILIKE '%promoteur%';
--    -- ATTENDU : true
--
-- 2) Les deux noms de fonction sont libres (sinon on écraserait autre chose) :
--
--    SELECT proname, pg_get_function_identity_arguments(oid) AS args
--    FROM pg_proc WHERE pronamespace = 'public'::regnamespace
--      AND proname IN ('add_co_promoteur', 'remove_co_promoteur');
--    -- ATTENDU : 0 ligne
--
-- 3) Dépendances utilisées par le corps (doivent exister) :
--
--    SELECT proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace
--      AND proname IN ('is_super_admin', 'check_plan_member_limit', 'get_user_role');
--    -- ATTENDU : 3 lignes
--
-- 4) ⭐ BLOQUANT — quelle définition de `is_super_admin()` tourne réellement ?
--
--    Deux versions coexistent dans les fichiers, avec des SOURCES DIFFÉRENTES :
--      * 20260109000509 → lit `auth.users.is_super_admin` (colonne dédiée)
--      * 20260112000003 → lit `bar_members.role = 'super_admin'` avec un
--        **LIMIT 1 SANS ORDER BY et SANS filtre bar_id**
--
--    C'est la garde CENTRALE des deux RPC de cette migration. Si c'est la 2e qui
--    tourne, un utilisateur membre de plusieurs bars dont un seul en super_admin
--    obtient un résultat NON DÉTERMINISTE.
--
--    SELECT pg_get_functiondef(oid) FROM pg_proc
--    WHERE pronamespace = 'public'::regnamespace AND proname = 'is_super_admin';
--
--    ⭐ RELEVÉ EN PROD LE 01/09/2026 : c'est la version `bar_members` + LIMIT 1
--       (la moins sûre des deux) qui tourne.
--
--       Risque évalué et ACCEPTÉ pour cette migration : l'unique super_admin
--       (7c2b6776-…) n'a qu'UNE SEULE ligne active dans bar_members — vérifié.
--       La fonction est donc déterministe PAR CONFIGURATION.
--
--       ⚠ DETTE IDENTIFIÉE, hors périmètre de ce chantier (431 points d'usage,
--         exige sa propre migration + plan de test) :
--         → mémoire `project_is_super_admin_fragile`
--         → CONDITION DE DÉCLENCHEMENT : le jour où le compte super_admin est
--           ajouté comme membre d'un bar (démo, dépannage), is_super_admin()
--           pourra retourner false par intermittence = perte d'accès admin
--           totale et silencieuse. **Corriger la fonction AVANT de faire cela.**

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- 1/2 — add_co_promoteur : SuperAdmin UNIQUEMENT
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.add_co_promoteur(
  p_bar_id  UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_actor_id      UUID := auth.uid();
  v_existing_role TEXT;
  v_user_name     TEXT;
  v_member_id     UUID;
BEGIN
  -- 🛡️ GARDE 1 — SuperAdmin uniquement (décision n°4).
  IF NOT is_super_admin() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Seul un super administrateur peut nommer un co-promoteur.'
    );
  END IF;

  -- GARDE 2 — le bar existe et est actif.
  IF NOT EXISTS (SELECT 1 FROM public.bars WHERE id = p_bar_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bar introuvable.');
  END IF;

  -- GARDE 3 — l'utilisateur existe.
  SELECT name INTO v_user_name FROM public.users WHERE id = p_user_id;
  IF v_user_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Utilisateur introuvable.');
  END IF;

  -- GARDE 4 — le propriétaire du bar ne peut pas être son propre co-promoteur.
  --   Il EST déjà promoteur ; le rétrograder lui retirerait canCreateBars et
  --   casserait la facturation (bars.owner_id reste lui).
  IF EXISTS (SELECT 1 FROM public.bars WHERE id = p_bar_id AND owner_id = p_user_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Le propriétaire du bar est déjà promoteur — il ne peut pas être co-promoteur.'
    );
  END IF;

  -- État actuel du membre (NULL s'il n'est pas encore membre).
  SELECT role INTO v_existing_role
  FROM public.bar_members
  WHERE bar_id = p_bar_id AND user_id = p_user_id AND is_active = TRUE;

  -- GARDE 5 — ne jamais rétrograder un promoteur actif.
  IF v_existing_role IN ('promoteur', 'super_admin') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Cet utilisateur est déjà %s sur ce bar.', v_existing_role)
    );
  END IF;

  IF v_existing_role = 'co_promoteur' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cet utilisateur est déjà co-promoteur de ce bar.'
    );
  END IF;

  -- 🛡️ GARDE 5bis — REFUS de la promotion directe d'un SERVEUR.
  --
  --   MOTIF (trouvé en revue, 01/09/2026 — perte de données silencieuse) :
  --   le trigger `trg_sync_server_mapping` (20260727010000) s'exécute
  --   AFTER INSERT OR UPDATE sur bar_members. Sa branche `NEW.role <> 'serveur'`
  --   fait un **DELETE** de server_name_mappings — pas une désactivation.
  --   Or son propre commentaire précise que la désactivation existe parce que
  --   « les bons ouverts résolvent leur libellé via les mappings, un DELETE les
  --   anonymiserait ».
  --
  --   → Promouvoir un serveur ici ANONYMISERAIT rétroactivement ses bons de
  --     commande ouverts. Silencieux, irréversible, invisible au test si le
  --     serveur n'a pas de bon en cours.
  --
  --   Le trigger n'est PAS en cause : il est correct pour serveur→gérant, cas
  --   pour lequel il a été écrit et éprouvé. On impose donc ce chemin en deux
  --   temps plutôt que de dupliquer sa logique ici (une copie divergerait le
  --   jour où le trigger évolue).
  IF v_existing_role = 'serveur' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Ce membre est serveur. Le passer d''abord gérant via la gestion '
            || 'd''équipe, puis le nommer co-promoteur (préserve le libellé de ses '
            || 'bons de commande ouverts).'
    );
  END IF;

  -- ⭐ GARDE 6 — quota du plan (décision n°8 : le co-promoteur CONSOMME un siège,
  --   comme le cuisinier). check_plan_member_limit() renvoie FALSE si l'user est
  --   déjà membre actif (simple changement de rôle) — pas de faux positif.
  IF public.check_plan_member_limit(p_bar_id, p_user_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Limite de membres atteinte pour le plan de ce bar. Passer au plan supérieur.'
    );
  END IF;

  -- ⚠️ UPDATE si déjà membre (gérant/serveur promu), INSERT sinon.
  --   JAMAIS d'INSERT sur un membre existant : idx_bar_members_bar_user_unique
  --   porte sur (bar_id, user_id) WHERE user_id IS NOT NULL — un 2e INSERT
  --   violerait l'index. Le ON CONFLICT répète le MÊME prédicat partiel.
  INSERT INTO public.bar_members (bar_id, user_id, role, assigned_by, is_active, joined_at)
  VALUES (p_bar_id, p_user_id, 'co_promoteur', v_actor_id, TRUE, NOW())
  ON CONFLICT (bar_id, user_id) WHERE user_id IS NOT NULL
  DO UPDATE SET
    role        = EXCLUDED.role,
    is_active   = TRUE,
    assigned_by = EXCLUDED.assigned_by
  RETURNING id INTO v_member_id;

  RETURN jsonb_build_object(
    'success',   true,
    'member_id', v_member_id,
    'user_name', v_user_name,
    'previous_role', COALESCE(v_existing_role, 'aucun'),
    'message',   format('%s est désormais co-promoteur de ce bar.', v_user_name)
  );
END;
$$;

COMMENT ON FUNCTION public.add_co_promoteur(UUID, UUID) IS
'Nomme un co-promoteur sur un bar. SUPER_ADMIN UNIQUEMENT (décision fondateur du '
'01/09/2026 : nommer un associé donne accès aux salaires, à la comptabilité et à '
'l''annulation de ventes — c''est une décision de propriété, pas de gestion d''équipe). '
'Le promoteur en fait la demande hors application. Promeut un gérant/serveur existant '
'par UPDATE (jamais INSERT : index unique partiel sur (bar_id,user_id)). Consomme un '
'siège du plan comme tout membre. Refuse : le propriétaire du bar, un promoteur actif, '
'un co-promoteur déjà en place. NE PAS ouvrir add_bar_member_v2 à ce rôle.';

REVOKE ALL ON FUNCTION public.add_co_promoteur(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_co_promoteur(UUID, UUID) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- 2/2 — remove_co_promoteur : promoteur principal OU SuperAdmin
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.remove_co_promoteur(
  p_bar_id  UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_actor_id    UUID := auth.uid();
  v_actor_role  TEXT;
  v_is_owner    BOOLEAN;
  v_target_role TEXT;
  v_user_name   TEXT;
BEGIN
  -- Rôle de l'appelant sur CE bar + qualité de propriétaire.
  v_actor_role := get_user_role(p_bar_id);

  SELECT EXISTS (
    SELECT 1 FROM public.bars WHERE id = p_bar_id AND owner_id = v_actor_id
  ) INTO v_is_owner;

  -- 🛡️ GARDE 1 — SuperAdmin, propriétaire du bar, ou promoteur du bar.
  --   ⛔ Un co_promoteur est VOLONTAIREMENT exclu : pas de révocation hostile
  --      entre associés (décision fondateur du 01/09/2026).
  IF NOT (is_super_admin() OR v_is_owner OR v_actor_role = 'promoteur') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Seul le promoteur du bar ou un super administrateur peut retirer un co-promoteur.'
    );
  END IF;

  -- GARDE 2 — la cible est bien un co-promoteur actif de ce bar.
  SELECT bm.role, u.name INTO v_target_role, v_user_name
  FROM public.bar_members bm
  JOIN public.users u ON u.id = bm.user_id
  WHERE bm.bar_id = p_bar_id AND bm.user_id = p_user_id AND bm.is_active = TRUE;

  IF v_target_role IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Membre actif introuvable sur ce bar.');
  END IF;

  IF v_target_role <> 'co_promoteur' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Ce membre est %s, pas co-promoteur. Utiliser la gestion d''équipe.', v_target_role)
    );
  END IF;

  -- ⚠️ Désactivation, PAS de suppression : conserve la traçabilité (qui a fait
  --   quoi pendant l'absence du promoteur — décision n°5). La ligne reste et
  --   occupe l'index unique : une réactivation future sera un UPDATE.
  UPDATE public.bar_members
  SET is_active = FALSE
  WHERE bar_id = p_bar_id AND user_id = p_user_id;

  RETURN jsonb_build_object(
    'success',   true,
    'user_name', v_user_name,
    'message',   format('%s n''est plus co-promoteur de ce bar.', v_user_name)
  );
END;
$$;

COMMENT ON FUNCTION public.remove_co_promoteur(UUID, UUID) IS
'Retire un co-promoteur. Autorisé au SUPER_ADMIN, au propriétaire du bar et au promoteur '
'du bar — JAMAIS à un autre co_promoteur (pas de révocation hostile entre associés, '
'décision fondateur du 01/09/2026). Asymétrie assumée avec add_co_promoteur : le '
'SuperAdmin contrôle l''entrée, le promoteur garde la main sur la sortie en cas de '
'conflit urgent. Désactive (is_active=false) sans supprimer : préserve la traçabilité '
'des actions menées en l''absence du promoteur.';

REVOKE ALL ON FUNCTION public.remove_co_promoteur(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_co_promoteur(UUID, UUID) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL — à exécuter APRÈS                                     │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) Les 2 fonctions existent, SECURITY DEFINER, search_path figé :
--
--    SELECT proname, pg_get_function_identity_arguments(oid) AS args,
--           prosecdef, proconfig
--    FROM pg_proc WHERE pronamespace = 'public'::regnamespace
--      AND proname IN ('add_co_promoteur', 'remove_co_promoteur');
--    -- ATTENDU : 2 lignes · args = uuid, uuid · prosecdef = true
--    --           proconfig = {"search_path=public, extensions"}
--
-- 2) 🛡️ Privilèges — anon NE DOIT PAS pouvoir exécuter :
--
--    SELECT p.proname,
--           has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
--           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_role,
--           has_function_privilege('service_role',  p.oid, 'EXECUTE') AS svc
--    FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
--      AND p.proname IN ('add_co_promoteur', 'remove_co_promoteur');
--    -- ATTENDU : anon = FALSE · auth_role = TRUE
--    -- (svc : indifférent ici, ces RPC ne sont pas appelés par SyncManager)
--
-- 3) ⭐ add_bar_member_v2 REFUSE toujours co_promoteur (verrou de gouvernance).
--
--    ⚠ Tester le COMPORTEMENT, pas la présence d'une chaîne littérale : un simple
--    reformatage du RPC ferait échouer un test textuel sans qu'il y ait de
--    régression réelle.
--
--    SELECT public.add_bar_member_v2(
--      (SELECT id FROM public.bars LIMIT 1),
--      (SELECT id FROM public.users LIMIT 1),
--      'co_promoteur',
--      NULL
--    );
--    -- ATTENDU : {"success": false, "error": "Rôle invalide: \"co_promoteur\" ..."}
--    -- ⛔ Si le retour est success=true, la gouvernance est CONTOURNABLE :
--    --    ARRÊTER et rétablir le refus avant de continuer.
--    -- ⚠ Vérifier ensuite qu'aucune ligne n'a été créée :
--    --    SELECT count(*) FROM public.bar_members WHERE role = 'co_promoteur';
--    --    -- ATTENDU : 0
--
-- 4) ⭐ Test fonctionnel — le SQL Editor a auth.uid() = NULL, donc is_super_admin()
--    y est FAUX : l'appel doit être REFUSÉ. C'est le test négatif attendu.
--
--    SELECT public.add_co_promoteur(
--      (SELECT id FROM public.bars LIMIT 1),
--      (SELECT id FROM public.users LIMIT 1)
--    );
--    -- ATTENDU : {"success": false, "error": "Seul un super administrateur ..."}
--    -- ⚠ Le test POSITIF ne peut se faire que depuis l'UI connectée en
--    --   super_admin (auth.uid() réel) — cf. mémoire feedback_migrations_manual_sql_editor.
--
-- ⚠ RAPPEL — le rôle reste INEXPLOITABLE : RLS (4), RPC métier (5-7) et front (8)
--    ne le connaissent pas. NE PAS créer de co-promoteur réel maintenant.
