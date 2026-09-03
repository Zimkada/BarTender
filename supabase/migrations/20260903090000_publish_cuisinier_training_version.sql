-- ===================================================================
-- MIGRATION: Publier la version de formation du cuisinier
-- DATE: 2026-09-03
-- AUTHOR: Zimkada
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BUSINESS CONTEXT                                                │
-- └─────────────────────────────────────────────────────────────────┘

-- PROBLEM:
--   La migration 20260802090100 a ouvert le CHECK de `training_versions.role`
--   a 'cuisinier', mais elle se terminait explicitement sur : « AUCUN contenu
--   de formation cuisinier n'est cree par cette migration - elle ouvre
--   seulement la possibilite. Un cuisinier connecte verra un parcours vide
--   jusqu'a ce que du contenu soit publie (chantier produit, hors phase 0). »
--
--   Ce contenu existe desormais cote application (03/09/2026) :
--     - `KitchenIntroStep`  : accueil metier du cuisinier
--     - `OnboardingContext` : sequence WELCOME → ROLE_DETECTED → KITCHEN_INTRO
--     - `TrainingFlow`      : reprise depuis l'onglet Formation du profil
--
--   Sans ligne dans `training_versions`, `TrainingTab.tsx` (SELECT filtre sur
--   le role, `.single()`) obtient data = null et journalise
--   « No training version found for role: cuisinier ». Le cuisinier garde son
--   parcours a la premiere connexion, mais l'onglet Formation de son profil ne
--   peut ni afficher de version ni signaler une mise a jour ulterieure.

-- IMPACT:
--   Table de contenu pedagogique (metadata). Aucune donnee utilisateur.
--   Aucun bar affecte. Une seule ligne inseree.

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ TECHNICAL SOLUTION                                              │
-- └─────────────────────────────────────────────────────────────────┘

-- SOLUTION:
--   INSERT de la version 1 pour 'cuisinier', aligne sur les trois roles deja
--   presents (promoteur/gerant/serveur, tous en version 1 depuis 20260127).
--   `ON CONFLICT (role, version) DO NOTHING` : rejouable sans effet de bord.

-- BREAKING_CHANGE: NO - insertion seule, aucune ligne existante touchee.

-- ROLLBACK_STRATEGY:
--   DELETE FROM public.training_versions WHERE role = 'cuisinier' AND version = 1;

-- TABLES_MODIFIED: training_versions (1 ligne inseree)

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL                                                         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) Le CHECK accepte bien 'cuisinier' (pose par 20260802090100) :
--
--    SELECT pg_get_constraintdef(oid)
--    FROM pg_constraint
--    WHERE conrelid = 'public.training_versions'::regclass AND contype = 'c';
--    -- ATTENDU : CHECK (role = ANY (ARRAY['promoteur','gerant','serveur','cuisinier']))
--    -- ⛔ Si 'cuisinier' est ABSENT, appliquer d'abord 20260802090100 :
--    --    cet INSERT echouerait sur la contrainte.
--
-- 2) Etat actuel (comparaison post-vol) :
--
--    SELECT role, version FROM public.training_versions ORDER BY role, version;

BEGIN;

INSERT INTO public.training_versions (role, version, changelog) VALUES
  ('cuisinier', 1, 'Formation initiale : file de commandes, production a l''avance, declaration des pertes')
ON CONFLICT (role, version) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL                                                        │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) La ligne existe :
--
--    SELECT role, version, changelog FROM public.training_versions
--    WHERE role = 'cuisinier';
--    -- ATTENDU : exactement 1 ligne, version 1
--
-- 2) Les autres roles sont inchanges (comparer au pre-vol 2) :
--
--    SELECT role, version FROM public.training_versions ORDER BY role, version;
--
-- 3) Smoke-test UI (hors SQL Editor) : se connecter avec un compte cuisinier,
--    ouvrir Profil → Formation. ATTENDU : la formation s'affiche avec le
--    libelle « Cuisinier », et non l'avertissement console
--    « No training version found for role: cuisinier ».
