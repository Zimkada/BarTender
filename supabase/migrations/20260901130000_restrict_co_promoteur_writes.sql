-- ===================================================================
-- MIGRATION: 🛡️ Policies RESTRICTIVES — écriture du rôle co_promoteur
-- DATE: 2026-09-01
-- AUTHOR: AI Assistant
-- PHASE: Étape 4a/8 du chantier co-promoteur
-- ORDRE: 4a/8 — APRÈS 20260901100000 (RPC), AVANT l'ouverture des RLS métier (4b)
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ LE PROBLÈME — fenêtre ouverte depuis l'étape 1                  │
-- └─────────────────────────────────────────────────────────────────┘

-- Depuis 20260901090000, la contrainte CHECK accepte 'co_promoteur'. Or les
-- policies d'écriture de bar_members laissent un PROMOTEUR poser n'importe
-- quel rôle — aucune ne restreint la VALEUR posée :
--
--   UPDATE : bar_members_update_policy       → `get_user_role(bar_id) = 'promoteur'`
--   INSERT : « Managers can add members »    → `get_user_role(bar_id) IN ('promoteur','gerant')`
--   DELETE : « Promoteurs can delete bar members » → `get_user_role(bar_id) = 'promoteur'`
--
-- `authenticated` possède INSERT/UPDATE/DELETE sur la table (vérifié en prod) :
-- les RLS sont la SEULE barrière. Un promoteur peut donc, par appel direct à
-- l'API REST, créer un co_promoteur — **contournant la décision n°4**
-- (nomination réservée au SuperAdmin) que l'étape 3 a verrouillée côté RPC.

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POURQUOI DES POLICIES *RESTRICTIVES*                            │
-- └─────────────────────────────────────────────────────────────────┘

-- ⚠️ Les policies PostgreSQL sont PERMISSIVES par défaut : elles se combinent
--    par **OR**. Durcir `bar_members_update_policy` ne servirait donc à rien —
--    le chemin INSERT resterait ouvert, et inversement. Il faudrait modifier
--    les 3 policies de façon cohérente, avec le risque d'en oublier une (ou
--    qu'une 4e soit ajoutée plus tard sans reprendre la restriction).
--
-- Une policy **RESTRICTIVE** se combine par **AND** avec toutes les autres :
--
--   (permissive_1 OR permissive_2 OR …) AND (restrictive_1 AND …)
--
-- Elle pose une condition que rien ne peut contourner, ni aujourd'hui ni après
-- l'ajout d'une future policy permissive.
--
-- ⭐ PREMIÈRES policies restrictives du projet — vérifié, aucune autre n'existe.

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ DEUX CHOIX DE CONCEPTION (corrigés en revue, 01/09/2026)        │
-- └─────────────────────────────────────────────────────────────────┘

-- ⭐ CHOIX 1 — TROIS policies (INSERT/UPDATE/DELETE), PAS `FOR ALL`.
--
--   `FOR ALL` couvre **aussi SELECT** : le USING s'appliquerait à la lecture et
--   les lignes co_promoteur deviendraient invisibles à tout non-SuperAdmin.
--   Cela casserait :
--     · la page Équipe — le promoteur ne verrait pas son associé ;
--     · `get_user_role()` / `is_bar_member()` pour le co-promoteur LUI-MÊME,
--       qui ne verrait pas sa propre ligne → session potentiellement cassée ;
--     · `remove_co_promoteur` depuis l'UI — impossible de lister qui retirer.
--
--   PostgreSQL n'accepte pas `FOR INSERT, UPDATE, DELETE` en une clause : on
--   écrit donc trois policies. La LECTURE reste régie par les permissives
--   existantes — comportement attendu, inchangé.
--
--   ⚠ INSERT n'accepte QUE `WITH CHECK` (pas de ligne « avant »), DELETE n'accepte
--     QUE `USING` (pas de ligne « après ») — d'où l'asymétrie ci-dessous. Ce n'est
--     pas un oubli : c'est la grammaire de PostgreSQL.

-- ⭐ CHOIX 2 — PAS de clause `TO`.
--
--   Une policy restrictive ne restreint QUE les rôles qu'elle cite. `TO
--   authenticated` laisserait tout autre rôle disposant des GRANT échapper à la
--   restriction, alors que les permissives — qui n'ont pas de `TO` et couvrent
--   donc PUBLIC — l'autoriseraient. Seul `authenticated` a ces droits
--   aujourd'hui, mais faire dépendre une protection de cette configuration
--   serait fragile. On s'aligne sur les policies existantes de la table : pas
--   de `TO`.

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ CE QUE CES POLICIES N'AFFECTENT PAS                             │
-- └─────────────────────────────────────────────────────────────────┘

-- ✅ Les autres rôles : `role <> 'co_promoteur'` est vrai pour
--    gerant/serveur/cuisinier/promoteur → restriction neutre, les permissives
--    décident seules, exactement comme aujourd'hui.
--
-- ✅ La LECTURE : aucune restriction sur SELECT (cf. CHOIX 1).
--
-- ✅ Les RPC : `add_co_promoteur` / `remove_co_promoteur` sont SECURITY DEFINER,
--    exécutés avec les droits du propriétaire (postgres, BYPASSRLS) → hors RLS.
--    ⚠ VÉRIFIÉ PAR LE POST-VOL 3, pas supposé.
--
-- ✅ La file offline : aucune écriture sur bar_members dans SyncManager /
--    offlineQueue (vérifié le 01/09/2026).

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ ⚠️ DEUX PIÈGES À CONNAÎTRE (trouvés en revue, 01/09/2026)        │
-- └─────────────────────────────────────────────────────────────────┘

-- ⚠️ PIÈGE 1 — un UPDATE refusé par ces policies est SILENCIEUX.
--
--   Un `USING` qui échoue **filtre la ligne** au lieu de lever une erreur : un
--   UPDATE direct sur une ligne co_promeur affecte **0 ligne, sans exception**.
--   Le client croit avoir réussi.
--
--   `AuthService.deactivateMember` / `activateMember`
--   (src/services/supabase/auth.service.ts:1031, :1051) sont exactement ce
--   motif : `.from('bar_members').update({is_active}).eq(...)` en direct.
--   ⭐ Vérifié le 01/09/2026 : ces deux méthodes ne sont appelées NULLE PART
--     (code mort) — le piège est donc latent, pas actif.
--
--   ⛔ CONTRAINTE POUR L'ÉTAPE 8 : toute écriture visant une ligne
--      co_promoteur DOIT passer par `add_co_promoteur` / `remove_co_promoteur`
--      (SECURITY DEFINER, hors RLS), JAMAIS par un `.update()` direct. Rien
--      dans la base ne le fait respecter — c'est une règle de code.

-- ⚠️ PIÈGE 2 — ces 3 policies dépendent toutes de `is_super_admin()`, dont le
--   défaut est connu (mémoire `project_is_super_admin_fragile`) : elle fait un
--   `LIMIT 1` sans `ORDER BY` ni filtre `bar_id` sur bar_members.
--
--   ⭐ AGGRAVATION SPÉCIFIQUE ICI : une policy RESTRICTIVE se combine par AND —
--     **aucune policy permissive ne peut compenser** un faux négatif. Si le
--     compte super_admin était un jour ajouté comme membre d'un bar, le
--     `LIMIT 1` pourrait renvoyer la mauvaise ligne et lui retirer TOUT droit
--     d'écriture sur les lignes co_promoteur — y compris via l'UI.
--
--   Aujourd'hui sans effet : l'unique super_admin n'a qu'une ligne active
--   (vérifié). Les RPC restent de toute façon opérationnels (SECURITY DEFINER).
--   ⛔ Corriger `is_super_admin()` AVANT d'ajouter ce compte à un bar.

-- IMPACT: aucune donnée. Aucun co_promoteur n'existe encore (0 en base).
-- BREAKING_CHANGE: NO — la restriction ne mord que sur un rôle inexistant à ce jour.

-- ROLLBACK_STRATEGY:
--   DROP POLICY IF EXISTS "co_promoteur_insert_superadmin_only" ON public.bar_members;
--   DROP POLICY IF EXISTS "co_promoteur_update_superadmin_only" ON public.bar_members;
--   DROP POLICY IF EXISTS "co_promoteur_delete_superadmin_only" ON public.bar_members;
--   ⚠ Rouvre la fenêtre : un promoteur pourrait à nouveau créer un co_promoteur
--     par appel direct à l'API REST.

-- TABLES_MODIFIED: aucune · FUNCTIONS_MODIFIED: aucune
-- RLS_CHANGES: +3 policies RESTRICTIVES sur bar_members (aucune existante modifiée)

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL — à exécuter AVANT                                      │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) État actuel : aucune restrictive, noms libres :
--
--    SELECT policyname, cmd, permissive
--    FROM pg_policies
--    WHERE schemaname='public' AND tablename='bar_members'
--    ORDER BY permissive, cmd;
--    -- ATTENDU : 7 policies, TOUTES `permissive = PERMISSIVE`,
--    --           aucune nommée « co_promoteur_%_superadmin_only »
--
-- 2) Aucun co_promoteur existant :
--
--    SELECT count(*) FROM public.bar_members WHERE role = 'co_promoteur';
--    -- ATTENDU : 0
--
-- 3) Les 2 RPC de l'étape 3 sont SECURITY DEFINER et leur propriétaire a BYPASSRLS :
--
--    SELECT p.proname, p.prosecdef, r.rolname AS proprietaire, r.rolbypassrls
--    FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
--    WHERE p.pronamespace='public'::regnamespace
----      AND p.proname IN ('add_co_promoteur','remove_co_promoteur',
--                        'admin_manage_bar_member');
--    -- ATTENDU : prosecdef = true ET rolbypassrls = true pour les deux
--    -- ⛔ Si rolbypassrls = false : les RPC seraient bloqués par ces policies.
--    --    NE PAS EXÉCUTER, me le signaler.

BEGIN;

-- 🛡️ Garde : la contrainte CHECK doit ACCEPTER le rôle, sinon ces policies
--    protégeraient une valeur que la base refuse — signe d'un ordre incorrect.
--
--    ⚠️ Corrigé en revue (01/09/2026) : tester `pg_get_constraintdef(oid) ILIKE
--       '%co_promoteur%'` était INSUFFISANT — une contrainte du type
--       `role <> 'co_promoteur'` contient la sous-chaîne tout en interdisant la
--       valeur. La garde aurait certifié précisément l'état qu'elle doit
--       détecter. On teste donc l'ACCEPTATION RÉELLE, par un INSERT annulé.
DO $$
DECLARE
  v_bar  UUID;
  v_user UUID;
BEGIN
  SELECT id INTO v_bar  FROM public.bars  LIMIT 1;
  SELECT id INTO v_user FROM public.users LIMIT 1;

  IF v_bar IS NULL OR v_user IS NULL THEN
    RAISE EXCEPTION 'Base sans bar ou sans utilisateur — impossible de tester la contrainte. Migration interrompue.';
  END IF;

  -- Sous-transaction : l'INSERT est TOUJOURS annulé, il ne sert qu'à savoir si
  -- la valeur passe la contrainte CHECK.
  BEGIN
    INSERT INTO public.bar_members (bar_id, user_id, role, is_active)
    VALUES (v_bar, v_user, 'co_promoteur', FALSE);
    RAISE EXCEPTION 'sonde_ok';   -- annule la sous-transaction, valeur acceptée
  EXCEPTION
    WHEN check_violation THEN
      RAISE EXCEPTION
        'Étape 1 (20260901090000) non appliquée ou incorrecte : la contrainte '
        'CHECK REFUSE ''co_promoteur''. Migration interrompue.';
    WHEN unique_violation THEN
      NULL;  -- ligne déjà présente pour ce couple : la contrainte CHECK a donc
             -- été franchie, c'est ce qu'on voulait savoir.
    WHEN OTHERS THEN
      IF SQLERRM = 'sonde_ok' THEN
        NULL;  -- cas nominal : la valeur est acceptée
      ELSE
        RAISE;
      END IF;
  END;
END $$;

DROP POLICY IF EXISTS "co_promoteur_insert_superadmin_only" ON public.bar_members;
DROP POLICY IF EXISTS "co_promoteur_update_superadmin_only" ON public.bar_members;
DROP POLICY IF EXISTS "co_promoteur_delete_superadmin_only" ON public.bar_members;

-- ═══ INSERT — seul le SuperAdmin peut PRODUIRE une ligne co_promoteur ═══
--   (INSERT n'accepte que WITH CHECK : il n'y a pas de ligne « avant ».)
CREATE POLICY "co_promoteur_insert_superadmin_only"
  ON public.bar_members
  AS RESTRICTIVE
  FOR INSERT
  WITH CHECK (role <> 'co_promoteur' OR is_super_admin());

-- ═══ UPDATE — ni cibler, ni produire une ligne co_promoteur ═══
--   USING  : la ligne AVANT (empêche de modifier/désactiver un co-promoteur)
--   CHECK  : la ligne APRÈS (empêche de promouvoir vers co_promoteur)
CREATE POLICY "co_promoteur_update_superadmin_only"
  ON public.bar_members
  AS RESTRICTIVE
  FOR UPDATE
  USING      (role <> 'co_promoteur' OR is_super_admin())
  WITH CHECK (role <> 'co_promoteur' OR is_super_admin());

-- ═══ DELETE — seul le SuperAdmin peut supprimer une ligne co_promoteur ═══
--   (DELETE n'accepte que USING : il n'y a pas de ligne « après ».)
--   ⭐ Complète `remove_co_promoteur`, qui DÉSACTIVE au lieu de supprimer pour
--      préserver la traçabilité (décision n°5) : un DELETE direct par un
--      promoteur contournerait cette intention.
CREATE POLICY "co_promoteur_delete_superadmin_only"
  ON public.bar_members
  AS RESTRICTIVE
  FOR DELETE
  USING (role <> 'co_promoteur' OR is_super_admin());

COMMENT ON POLICY "co_promoteur_insert_superadmin_only" ON public.bar_members IS
'🛡️ RESTRICTIVE (combinée par AND) — seul un super_admin peut INSÉRER une ligne de rôle '
'''co_promoteur''. Fait respecter la décision fondateur du 01/09/2026 (nomination '
'réservée au SuperAdmin) au niveau RLS, en complément du verrou RPC. Neutre pour tous '
'les autres rôles. N''affecte pas add_co_promoteur (SECURITY DEFINER, hors RLS). '
'Volontairement SANS clause TO : une restrictive ne restreint que les rôles cités.';

COMMENT ON POLICY "co_promoteur_update_superadmin_only" ON public.bar_members IS
'🛡️ RESTRICTIVE — seul un super_admin peut cibler OU produire une ligne ''co_promoteur'' '
'par UPDATE. Ferme le chemin « promoteur promeut son gérant par appel REST direct », qui '
'contournait la gouvernance. La LECTURE reste libre (policies permissives) : le promoteur '
'voit son associé, le co-promoteur voit sa propre ligne.';

COMMENT ON POLICY "co_promoteur_delete_superadmin_only" ON public.bar_members IS
'🛡️ RESTRICTIVE — seul un super_admin peut SUPPRIMER une ligne ''co_promoteur''. '
'Complète remove_co_promoteur, qui désactive (is_active=false) au lieu de supprimer afin '
'de préserver la traçabilité (décision n°5) : un DELETE direct contournerait cette '
'intention. Le promoteur garde le droit de RETIRER son associé — via le RPC.';

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL — à exécuter APRÈS                                     │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) Les 3 policies existent et sont bien RESTRICTIVES :
--
--    SELECT policyname, cmd, permissive
--    FROM pg_policies
--    WHERE schemaname='public' AND tablename='bar_members'
--      AND policyname LIKE 'co_promoteur_%'
--    ORDER BY cmd;
--    -- ATTENDU : 3 lignes · cmd = DELETE, INSERT, UPDATE
--    --           **permissive = RESTRICTIVE** pour les trois
--    -- ⛔ Si l'une est PERMISSIVE : elle ÉLARGIRAIT au lieu de restreindre.
--    --    La supprimer et reprendre.
--
-- 2) Aucune policy SELECT n'a été ajoutée (la lecture doit rester libre) :
--
--    SELECT count(*) FILTER (WHERE permissive='PERMISSIVE')  AS permissives,
--           count(*) FILTER (WHERE permissive='RESTRICTIVE') AS restrictives,
--           count(*) FILTER (WHERE permissive='RESTRICTIVE' AND cmd IN ('SELECT','ALL')) AS restrictives_lecture
--    FROM pg_policies WHERE schemaname='public' AND tablename='bar_members';
--    -- ATTENDU : permissives = 7 · restrictives = 3 · restrictives_lecture = 0
--
-- 3) ⭐ NON-RÉGRESSION DES RPC — vérification décisive :
--
--    SELECT p.proname, r.rolname AS proprietaire, r.rolbypassrls
--    FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
--    WHERE p.pronamespace='public'::regnamespace
----      AND p.proname IN ('add_co_promoteur','remove_co_promoteur',
--                        'admin_manage_bar_member');
--    -- ATTENDU : rolbypassrls = true — sinon les RPC seraient bloqués par
--    --           leur propre policy. ARRÊTER et signaler si false.
--
-- 4) TEST FONCTIONNEL — la restriction mord.
--
--    BEGIN;
--      -- doit ÉCHOUER : « new row violates row-level security policy »
--      -- INSERT INTO public.bar_members (bar_id, user_id, role, is_active)
--      -- VALUES ('<bar>', '<user>', 'co_promoteur', true);
--      -- doit RÉUSSIR (rôle non restreint) :
--      -- INSERT INTO public.bar_members (bar_id, user_id, role, is_active)
--      -- VALUES ('<bar>', '<user2>', 'serveur', true);
--    ROLLBACK;
--    -- ⚠ TOUJOURS ROLLBACK.
--    -- ⚠ TEST POTENTIELLEMENT NON CONCLUANT : le SQL Editor peut s'exécuter en
--    --   rôle privilégié (postgres/BYPASSRLS), auquel cas les DEUX réussiront —
--    --   ce ne serait PAS un échec de la policy, juste un test inopérant.
--    --   Même piège que le test (b) de l'étape 3. Le test réel se fait depuis
--    --   l'UI connecté en promoteur, à l'étape 8.
--
-- ⚠ RAPPEL : le rôle reste INEXPLOITABLE (RLS métier 4b, RPC 5-7, front 8).
