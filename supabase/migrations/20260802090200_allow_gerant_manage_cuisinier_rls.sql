-- ===================================================================
-- MIGRATION: RLS bar_members — le gérant peut gérer un cuisinier
-- DATE: 2026-08-02
-- AUTHOR: AI Assistant
-- PHASE: 0 du module restauration (réponse Q1 de MATRICE_RBAC_CUISINIER.md §7)
-- ORDRE: 3/4 — APRÈS la contrainte CHECK (1/4)
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BUSINESS CONTEXT                                                │
-- └─────────────────────────────────────────────────────────────────┘

-- PROBLEM:
--   La policy UPDATE de bar_members (20260218000000) restreint le gérant à poser
--   `role = 'serveur'` — une liste blanche à UN SEUL élément :
--
--     (get_user_role(bar_id) = 'gerant' AND role = 'serveur')
--
--   Sans modification, un gérant ne pourrait JAMAIS créer, promouvoir ni
--   rétrograder un cuisinier, même si on l'y autorisait ailleurs.

-- DÉCISION (Q1, MATRICE_RBAC_CUISINIER.md §7) : **OUI**, le gérant peut gérer un
--   cuisinier. Il est responsable de l'exploitation quotidienne ; exiger le
--   promoteur pour recruter un cuisinier bloquerait le service.

-- IMPACT:
--   Tous les bars. AUCUN changement pour les 4 rôles actuels : la clause
--   ajoutée n'élargit les droits du gérant QUE sur la valeur 'cuisinier'.

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ TECHNICAL SOLUTION                                              │
-- └─────────────────────────────────────────────────────────────────┘

-- SOLUTION:
--   `role = 'serveur'` → `role IN ('serveur','cuisinier')` dans le WITH CHECK.

-- ⚠ SÉCURITÉ — l'anti-escalade reste INTACT :
--   - Le gérant ne peut poser QUE 'serveur' ou 'cuisinier'. Il ne peut pas
--     s'auto-promouvoir ni promouvoir quelqu'un en 'gerant'/'promoteur'/'super_admin'.
--   - Le cuisinier étant au niveau 4 (comme le serveur, §12.5), l'autoriser
--     n'ouvre AUCUN chemin d'élévation de privilège.
--   - Le garde-fou de add_bar_member_v2 (20260227100000:215, blocage du downgrade
--     d'un promoteur/super_admin) est dans une AUTRE fonction et n'est pas touché.

-- BREAKING_CHANGE: NO — additif, strictement permissif sur une seule valeur.

-- ⚠️⚠️ ÉCART FICHIER / PRODUCTION DÉTECTÉ AU PRÉ-VOL (02/08/2026)
--   La policy réellement déployée n'est PAS celle de 20260218000000 :
--
--     Fichier 20260218000000 : USING (is_super_admin() OR get_user_role(bar_id)
--                                     IN ('promoteur','gerant'))
--     PRODUCTION             : USING (is_super_admin() OR promoteur
--                                     OR (gerant AND role = 'serveur'))
--
--   La prod est PLUS RESTRICTIVE : son USING est identique à son WITH CHECK.
--   Une autre migration l'a redéfinie après, ou elle a été ajustée à la main.
--   ⛔ Reprendre le fichier aurait ÉLARGI les droits de ciblage du gérant.
--   → Cette migration part de l'état RÉEL relevé, et n'ajoute que 'cuisinier'
--     aux deux clauses. Même leçon que create_sale_idempotent (9 versions) :
--     LA BASE FAIT FOI, PAS LE FICHIER.

-- ⚠️ CONSTAT ANNEXE : l'INSERT est déjà ouvert au gérant sans contrainte de rôle
--   cible (policy "Managers can add members" : promoteur OU gerant, aucun filtre
--   sur `role`). Un gérant pouvait donc DÉJÀ insérer un cuisinier — seule la
--   contrainte CHECK l'en empêchait. Aucune modification nécessaire de ce côté.

-- ROLLBACK_STRATEGY:
--   ⛔ NE PAS rejouer 20260218000000 (il ne reflète pas la prod — cf. ci-dessus).
--   Restaurer exactement l'état relevé au pré-vol :
--     DROP POLICY IF EXISTS "bar_members_update_policy" ON public.bar_members;
--     CREATE POLICY "bar_members_update_policy"
--       ON public.bar_members FOR UPDATE
--       USING (is_super_admin() OR get_user_role(bar_id) = 'promoteur'
--              OR (get_user_role(bar_id) = 'gerant' AND role = 'serveur'))
--       WITH CHECK (is_super_admin() OR get_user_role(bar_id) = 'promoteur'
--              OR (get_user_role(bar_id) = 'gerant' AND role = 'serveur'));

-- RLS_CHANGES: policy "bar_members_update_policy" (UPDATE) — WITH CHECK élargi
-- TABLES_MODIFIED: aucune donnée · FUNCTIONS_MODIFIED: aucune

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL                                                         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ⛔ PRÉREQUIS BLOQUANT : la migration 1/4 (contrainte CHECK) DOIT être appliquée.
--    Sans elle, un gérant autorisé par la RLS se heurterait à la contrainte —
--    erreur incompréhensible côté UI.
--
--    SELECT pg_get_constraintdef(oid) LIKE '%cuisinier%' AS check_ok
--    FROM pg_constraint
--    WHERE conrelid = 'public.bar_members'::regclass AND contype = 'c';
--    -- ATTENDU : true. ⛔ Si false, APPLIQUER 1/4 D'ABORD.
--
-- 1) Policy actuelle (archiver la définition = filet de rollback réel) :
--
--    SELECT polname, pg_get_expr(polqual, polrelid)      AS using_expr,
--                    pg_get_expr(polwithcheck, polrelid) AS withcheck_expr
--    FROM pg_policy
--    WHERE polrelid = 'public.bar_members'::regclass AND polcmd = 'w';
--    -- ATTENDU : bar_members_update_policy, withcheck contenant
--    --   (get_user_role(bar_id) = 'gerant' AND role = 'serveur')
--
-- 2) RLS bien active sur la table :
--
--    SELECT relname, relrowsecurity FROM pg_class
--    WHERE oid = 'public.bar_members'::regclass;
--    -- ATTENDU : relrowsecurity = true

BEGIN;

-- Garde-fou : refuser d'appliquer si la contrainte CHECK n'accepte pas encore
-- 'cuisinier' (migration 1/4 non jouée). Élargir la RLS avant serait incohérent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.bar_members'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%cuisinier%'
  ) THEN
    RAISE EXCEPTION
      'Migration 1/4 (contrainte CHECK cuisinier) non appliquée — exécuter 20260802090000 d''abord';
  END IF;
END $$;

DROP POLICY IF EXISTS "bar_members_update_policy" ON public.bar_members;

-- ⚠️⚠️ BASE DE DÉPART = ÉTAT RÉEL EN PRODUCTION (relevé le 02/08/2026), PAS le
--    contenu de 20260218000000. Les deux DIVERGENT : ce fichier déclare
--    `USING (... get_user_role(bar_id) IN ('promoteur','gerant'))`, alors que la
--    prod porte `USING (... (gerant AND role = 'serveur'))` — donc un USING
--    IDENTIQUE au WITH CHECK, plus restrictif. Une reprise du fichier aurait
--    ÉLARGI les droits du gérant sans que personne ne le voie.
--    Même leçon que create_sale_idempotent : la base fait foi, pas le fichier.
CREATE POLICY "bar_members_update_policy"
  ON public.bar_members FOR UPDATE
  USING (
    is_super_admin() OR
    get_user_role(bar_id) = 'promoteur' OR
    -- ⭐ USING porte sur la ligne AVANT modification : le gérant ne peut cibler
    --    que des lignes déjà 'serveur' ou 'cuisinier'. Sans 'cuisinier' ici, il
    --    pourrait en créer un mais JAMAIS le modifier ensuite (le rétrograder,
    --    le désactiver) — un cul-de-sac fonctionnel.
    (get_user_role(bar_id) = 'gerant' AND role IN ('serveur', 'cuisinier'))
  )
  WITH CHECK (
    is_super_admin() OR
    get_user_role(bar_id) = 'promoteur' OR
    -- ⭐ WITH CHECK porte sur la ligne APRÈS modification : le gérant ne peut
    --    poser que 'serveur' ou 'cuisinier' — niveau 4, personnel opérationnel.
    --    Il ne peut toujours PAS poser 'gerant'/'promoteur'/'super_admin' :
    --    l'anti-escalade est intact.
    (get_user_role(bar_id) = 'gerant' AND role IN ('serveur', 'cuisinier'))
  );

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL                                                        │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⭐ LES DEUX clauses contiennent la nouvelle liste (USING ET WITH CHECK) :
--
--    SELECT polname,
--           pg_get_expr(polqual, polrelid)      AS using_expr,
--           pg_get_expr(polwithcheck, polrelid) AS withcheck_expr
--    FROM pg_policy
--    WHERE polrelid = 'public.bar_members'::regclass AND polcmd = 'w';
--    -- ATTENDU : les DEUX expressions contiennent
--    --   role = ANY (ARRAY['serveur'::text, 'cuisinier'::text])
--    -- ⛔ Si seul withcheck l'a : le gérant pourra créer un cuisinier mais
--    --    jamais le modifier ensuite. Rejouer la migration.
--
-- 2) Une seule policy UPDATE (pas de doublon issu du DROP/CREATE) :
--
--    SELECT count(*) FROM pg_policy
--    WHERE polrelid = 'public.bar_members'::regclass AND polcmd = 'w';
--    -- ATTENDU : 1
--
-- 3) RLS toujours active :
--
--    SELECT relrowsecurity FROM pg_class WHERE oid = 'public.bar_members'::regclass;
--    -- ATTENDU : true
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ TESTS PAR L'UI — auth.uid() vaut NULL en SQL Editor             │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ⚠ `get_user_role()` et `is_super_admin()` reposent sur auth.uid() : la policy
--   n'est PAS testable depuis le SQL Editor. Tests avec de vrais comptes :
--
-- ☐ Gérant → passe un membre en 'serveur'    : OK           [inchangé]
-- ☐ Gérant → passe un membre en 'cuisinier'  : OK           [⭐ NOUVEAU]
-- ☐ Gérant → tente de poser 'gerant'         : REFUSÉ       [inchangé, anti-escalade]
-- ☐ Gérant → tente de poser 'promoteur'      : REFUSÉ       [inchangé, anti-escalade]
-- ☐ Gérant → tente de s'auto-promouvoir      : REFUSÉ       [inchangé, anti-escalade]
-- ☐ Promoteur → pose n'importe quel rôle     : OK           [inchangé]
--
-- ⚠ Le passage EN 'cuisinier' via l'UI nécessite aussi la migration 4/4
--   (add_bar_member_v2) : l'UI passe par ce RPC, pas par un UPDATE direct.
