-- ===================================================================
-- MIGRATION: Autoriser 'cuisinier' dans training_versions
-- DATE: 2026-08-02
-- AUTHOR: AI Assistant
-- PHASE: 0 du module restauration
-- ORDRE: 2/4
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BUSINESS CONTEXT                                                │
-- └─────────────────────────────────────────────────────────────────┘

-- PROBLEM:
--   `training_versions.role` porte un CHECK limité à ('promoteur','gerant','serveur')
--   — il exclut même 'super_admin'. Impossible d'y publier un parcours de
--   formation destiné au cuisinier.
--
-- ⚠ CORRECTION D'UN POINT DE LA MATRICE (§4.2, vérifié le 02/08/2026) :
--   ce document annonçait « un cuisinier qui se connecte déclenche l'onboarding
--   → INSERT rejeté ». C'est FAUX. Vérification des 2 seuls appelants dans src/ :
--     - OnboardingContext.tsx:416 → SELECT ... .eq('role', userRole)
--     - TrainingTab.tsx:41        → SELECT ... .eq('role', currentSession.role)
--   Ce sont deux LECTURES filtrées. Un cuisinier ne provoque aucun INSERT : il
--   obtient simplement zéro ligne (`.single()` renvoie data = null, déjà géré par
--   `latestVersion?.version || 1` et par `if (versionData)`).
--
--   → Cette migration n'est donc PAS un correctif de bug bloquant, mais un
--     PRÉREQUIS pour pouvoir publier du contenu de formation cuisinier plus tard.
--     Elle reste utile et sans risque, mais son urgence est moindre que prévu.

-- IMPACT:
--   Table de contenu pédagogique. Aucune donnée utilisateur. Aucun bar affecté.

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ TECHNICAL SOLUTION                                              │
-- └─────────────────────────────────────────────────────────────────┘

-- SOLUTION:
--   DROP + ADD du CHECK avec 'cuisinier'. 'super_admin' est volontairement
--   LAISSÉ DE CÔTÉ : il n'a pas de parcours de formation (il n'utilise pas
--   l'app côté bar), et l'ajouter élargirait le périmètre sans besoin établi.

-- BREAKING_CHANGE: NO — strictement permissif.

-- ROLLBACK_STRATEGY:
--   ALTER TABLE public.training_versions DROP CONSTRAINT training_versions_role_check;
--   ALTER TABLE public.training_versions ADD CONSTRAINT training_versions_role_check
--     CHECK (role IN ('promoteur','gerant','serveur'));
--   ⚠ Échoue si une ligne 'cuisinier' existe déjà — la supprimer d'abord.

-- TABLES_MODIFIED: training_versions (contrainte uniquement)

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL                                                         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) La table existe et sa contrainte est bien celle attendue :
--
--    SELECT conname, pg_get_constraintdef(oid) AS def
--    FROM pg_constraint
--    WHERE conrelid = 'public.training_versions'::regclass AND contype = 'c';
--    -- ATTENDU : def contenant ARRAY['promoteur','gerant','serveur']
--    -- ⛔ Si la table n'existe pas (erreur "relation does not exist"),
--    --    SAUTER cette migration : elle est sans objet sur cette base.
--
-- 2) Contenu actuel (comparaison post-vol) :
--
--    SELECT role, count(*) FROM public.training_versions GROUP BY role;

BEGIN;

DO $$
DECLARE
  v_constraint_name TEXT;
  v_count           INT;
BEGIN
  -- Table absente → migration sans objet, on sort proprement.
  IF to_regclass('public.training_versions') IS NULL THEN
    RAISE NOTICE 'Table training_versions absente — migration ignorée (sans objet)';
    RETURN;
  END IF;

  SELECT count(*) INTO v_count
  FROM pg_constraint
  WHERE conrelid = 'public.training_versions'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%role%';

  IF v_count > 1 THEN
    RAISE EXCEPTION 'Plusieurs contraintes CHECK sur training_versions.role (%) — résoudre manuellement', v_count;
  END IF;

  IF v_count = 1 THEN
    SELECT conname INTO v_constraint_name
    FROM pg_constraint
    WHERE conrelid = 'public.training_versions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%role%';

    EXECUTE format('ALTER TABLE public.training_versions DROP CONSTRAINT %I', v_constraint_name);
    RAISE NOTICE 'Contrainte % supprimée', v_constraint_name;
  ELSE
    RAISE NOTICE 'Aucune contrainte CHECK sur role — ajout direct';
  END IF;

  -- Recréation sous un nom explicite et stable.
  -- ⚠️ Garde : si une contrainte porte DÉJÀ ce nom sans avoir été captée ci-dessus
  --    (nom identique mais définition ne mentionnant pas `role`), l'ADD échouerait
  --    sur un duplicate. On la supprime d'abord — idempotent.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.training_versions'::regclass
      AND conname = 'training_versions_role_check'
  ) THEN
    ALTER TABLE public.training_versions DROP CONSTRAINT training_versions_role_check;
  END IF;

  ALTER TABLE public.training_versions
    ADD CONSTRAINT training_versions_role_check
    CHECK (role IN ('promoteur', 'gerant', 'serveur', 'cuisinier'));
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL                                                        │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) La contrainte accepte 'cuisinier' :
--
--    SELECT conname, pg_get_constraintdef(oid)
--    FROM pg_constraint
--    WHERE conrelid = 'public.training_versions'::regclass AND contype = 'c';
--
-- 2) Contenu inchangé (comparer au pré-vol 2) :
--
--    SELECT role, count(*) FROM public.training_versions GROUP BY role;
--
-- ⚠ AUCUN contenu de formation cuisinier n'est créé par cette migration — elle
--   ouvre seulement la possibilité. Un cuisinier connecté verra un parcours vide
--   jusqu'à ce que du contenu soit publié (chantier produit, hors phase 0).
