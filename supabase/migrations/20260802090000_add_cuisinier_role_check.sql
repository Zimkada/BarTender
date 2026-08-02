-- ===================================================================
-- MIGRATION: Autoriser le rôle 'cuisinier' dans bar_members
-- DATE: 2026-08-02
-- AUTHOR: AI Assistant
-- PHASE: 0 du module restauration (PLAN_MODULE_RESTAURATION.md §12.5)
-- ORDRE: 1/4 — à exécuter EN PREMIER
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BUSINESS CONTEXT                                                │
-- └─────────────────────────────────────────────────────────────────┘

-- PROBLEM:
--   `bar_members.role` porte une contrainte CHECK limitée à 4 valeurs
--   (001_initial_schema.sql:76). Tout INSERT d'un cuisinier échoue.
--   C'est LE point qui empêche physiquement l'existence du rôle.
--
--   ⚠ Contrairement à ce qu'annonçait §12.5 (« 17 migrations »), il n'existe
--   qu'UNE SEULE contrainte CHECK sur cette colonne — les 16 autres occurrences
--   sont des `role IN (...)` de filtrage dans des RLS/RPC, traités séparément
--   (cf. MATRICE_RBAC_CUISINIER.md §4.1 et §4.3).

-- IMPACT:
--   Tous les bars. AUCUN effet sur les données existantes : purement permissif.

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ TECHNICAL SOLUTION                                              │
-- └─────────────────────────────────────────────────────────────────┘

-- SOLUTION:
--   DROP + ADD de la contrainte avec 'cuisinier' ajouté à la liste.
--   Nom de contrainte résolu DYNAMIQUEMENT : `001_initial_schema.sql` la déclare
--   en inline (`role TEXT NOT NULL CHECK (...)`), donc son nom est auto-généré
--   par Postgres (`bar_members_role_check` par convention, mais ce n'est pas
--   garanti sur une base ayant subi des restaurations). On ne devine pas — on lit
--   `pg_constraint`.

-- APPROACH:
--   ⭐ Prérequis satisfait : la migration 20260731120000 (liste blanche
--   create_sale_idempotent) est APPLIQUÉE en production depuis le 02/08/2026.
--   Le RPC des ventes refuse donc DÉJÀ tout rôle hors liste blanche — un
--   cuisinier ne pourra pas vendre dès l'instant où cette valeur devient légale.
--   C'est l'ordre imposé par §13.16, et il est respecté.

-- BREAKING_CHANGE: NO
--   Strictement permissif : la nouvelle contrainte accepte tout ce que l'ancienne
--   acceptait, plus une valeur. Aucune ligne existante ne peut la violer.

-- ROLLBACK_STRATEGY:
--   ALTER TABLE public.bar_members DROP CONSTRAINT bar_members_role_check;
--   ALTER TABLE public.bar_members ADD CONSTRAINT bar_members_role_check
--     CHECK (role IN ('super_admin','promoteur','gerant','serveur'));
--   ⚠ Le rollback ÉCHOUE si un cuisinier a déjà été créé — le supprimer d'abord.

-- TABLES_MODIFIED: bar_members (contrainte CHECK uniquement, aucune donnée)
-- FUNCTIONS_MODIFIED: aucune · RLS_CHANGES: aucune

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL — à exécuter AVANT, dans le SQL Editor                  │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) Nom et définition réels de la contrainte (NE PAS présumer du nom) :
--
--    SELECT conname, pg_get_constraintdef(oid) AS def
--    FROM pg_constraint
--    WHERE conrelid = 'public.bar_members'::regclass AND contype = 'c';
--    -- ATTENDU : 1 ligne dont la def contient
--    --   CHECK (role = ANY (ARRAY['super_admin','promoteur','gerant','serveur']))
--    -- ⛔ Si plusieurs contraintes CHECK existent, identifier CELLE portant sur
--    --    `role` avant de continuer.
--
-- 2) Aucune donnée n'utilise déjà la valeur (doit renvoyer 0) :
--
--    SELECT count(*) FROM public.bar_members WHERE role = 'cuisinier';
--
-- 3) Photographier la répartition actuelle (comparaison post-vol) :
--
--    SELECT role, count(*) FROM public.bar_members GROUP BY role ORDER BY role;

BEGIN;

-- Résolution dynamique du nom : on ne devine pas une contrainte inline.
DO $$
DECLARE
  v_constraint_name TEXT;
  v_count           INT;
BEGIN
  -- Toutes les contraintes CHECK de bar_members mentionnant la colonne `role`.
  SELECT count(*) INTO v_count
  FROM pg_constraint
  WHERE conrelid = 'public.bar_members'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%role%';

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Aucune contrainte CHECK sur bar_members.role — schéma inattendu, migration interrompue';
  END IF;

  IF v_count > 1 THEN
    RAISE EXCEPTION 'Plusieurs contraintes CHECK sur bar_members.role (%) — résoudre manuellement', v_count;
  END IF;

  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.bar_members'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%role%';

  EXECUTE format('ALTER TABLE public.bar_members DROP CONSTRAINT %I', v_constraint_name);

  RAISE NOTICE 'Contrainte % supprimée, recréation avec cuisinier...', v_constraint_name;

  -- ⚠️ Garde : si une contrainte portait déjà le nom cible sans avoir été captée
  --    ci-dessus (nom identique, définition ne mentionnant pas `role`), l'ADD
  --    échouerait sur un duplicate. On la supprime d'abord — idempotent.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.bar_members'::regclass
      AND conname = 'bar_members_role_check'
  ) THEN
    ALTER TABLE public.bar_members DROP CONSTRAINT bar_members_role_check;
  END IF;
END $$;

-- Recréation sous un nom EXPLICITE et stable, pour que les migrations futures
-- n'aient plus à le résoudre dynamiquement.
ALTER TABLE public.bar_members
  ADD CONSTRAINT bar_members_role_check
  CHECK (role IN ('super_admin', 'promoteur', 'gerant', 'serveur', 'cuisinier'));

COMMENT ON CONSTRAINT bar_members_role_check ON public.bar_members IS
  'Rôles autorisés. ''cuisinier'' ajouté le 2026-08-02 (module restauration, §12.5) : '
  'rôle TRANSVERSAL au même niveau que serveur, permissions disjointes, sans canSell.';

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL — à exécuter APRÈS                                     │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) La contrainte accepte bien les 5 valeurs :
--
--    SELECT conname, pg_get_constraintdef(oid)
--    FROM pg_constraint
--    WHERE conrelid = 'public.bar_members'::regclass AND contype = 'c';
--    -- ATTENDU : bar_members_role_check, def contenant 'cuisinier'
--
-- 2) Aucune donnée perdue ni altérée (comparer au pré-vol 3) :
--
--    SELECT role, count(*) FROM public.bar_members GROUP BY role ORDER BY role;
--    -- ATTENDU : répartition IDENTIQUE au pré-vol
--
-- 3) ⭐ Test fonctionnel de la contrainte — À EXÉCUTER, puis ROLLBACK :
--
--    BEGIN;
--      -- doit RÉUSSIR (remplacer les UUID par des valeurs réelles du bar de test)
--      -- INSERT INTO public.bar_members (bar_id, user_id, role, is_active)
--      -- VALUES ('<bar>', '<user>', 'cuisinier', true);
--      -- doit ÉCHOUER avec une violation de contrainte :
--      -- INSERT INTO public.bar_members (bar_id, user_id, role, is_active)
--      -- VALUES ('<bar>', '<user>', 'plongeur', true);
--    ROLLBACK;
--    -- ⚠ TOUJOURS ROLLBACK : ce test ne doit rien laisser en base.
--
-- ⚠ RAPPEL — à ce stade le rôle est LÉGAL en base mais INEXPLOITABLE :
--    - `add_bar_member_v2` le refuse encore (migration 4/4) ;
--    - la RLS ne permet pas au gérant de le poser (migration 3/4) ;
--    - `UserRole` TypeScript ne le connaît pas (côté code, après les migrations).
--    C'est VOULU : la base accepte avant que quiconque puisse en créer un.
