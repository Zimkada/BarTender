-- ===================================================================
-- MIGRATION: Autoriser le rôle 'co_promoteur' (contraintes CHECK)
-- DATE: 2026-09-01
-- AUTHOR: AI Assistant
-- PHASE: Étape 1/8 du chantier co-promoteur
--        (docs/roadmaps/PLAN_CO_PROMOTEUR.md + PREZERO_CO_PROMOTEUR_INVENTAIRE.md)
-- ORDRE: 1/8 — à exécuter EN PREMIER, rien ne peut créer le rôle avant.
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BUSINESS CONTEXT                                                │
-- └─────────────────────────────────────────────────────────────────┘

-- BESOIN (fondateur, 01/09/2026) :
--   Des bars ont besoin qu'un associé effectue des opérations réservées au
--   promoteur PENDANT SON ABSENCE, en urgence, et qu'il suive la gestion.
--   C'est de la délégation AVEC ACTION, pas de la consultation.
--
--   Définition retenue : `co_promoteur` = `gerant` + 7 permissions
--   (canCancelSales, canManageExpenses, canManageUsers, canCreateManagers,
--    canViewAccounting, canManageSalaries, canSwitchBars), SANS canCreateBars.
--   → « gérant augmenté », jamais « promoteur diminué ».

-- PROBLEM:
--   Deux contraintes CHECK limitent les valeurs de rôle. Tant qu'elles ne
--   connaissent pas 'co_promoteur', le rôle ne peut PHYSIQUEMENT pas exister.

-- ⭐ PRÉ-VOL EXÉCUTÉ EN PROD LE 01/09/2026 — état réel constaté :
--   Seules 4 contraintes CHECK mentionnent un rôle. Les CHECK de `users`
--   (001_initial_schema.sql:76) et `user_onboarding` (20260127030000:27),
--   que la certification signalait comme risque, N'EXISTENT PLUS en base.
--   → 2 migrations économisées. Ne PAS les recréer.
--
--   Contraintes réellement présentes :
--     bar_members.role            → super_admin, promoteur, gerant, serveur, cuisinier
--     training_versions.role      → promoteur, gerant, serveur, cuisinier
--     wa_bar_links.role_snapshot  → promoteur, gerant, serveur   [VOIR NOTE ci-dessous]
--     wa_leads.role               → prospects (HORS PÉRIMÈTRE, ne pas toucher)

-- ⚠️ POURQUOI `wa_bar_links.role_snapshot` N'EST **PAS** TRAITÉE ICI
--   (décision de revue, 01/09/2026 — elle l'était dans la 1re version) :
--
--   Cette contrainte n'est pas une simple contrainte d'intégrité : c'est une
--   DÉFENSE EN PROFONDEUR du bot WhatsApp. C'est elle qui rend un rôle non
--   autorisé structurellement impossible à lier, même si un RPC était modifié
--   par erreur. Le commentaire de `request_wa_bar_link` (20260822090000) est
--   explicite : super_admin a été retiré de l'allowlist PARCE QUE « écrire
--   role_snapshot='super_admin' violerait son CHECK constraint ».
--
--   L'élargir ici (étape 1) alors que les RPC du bot ne le sont qu'à l'étape 6
--   laisserait ce verrou desserré pendant 5 étapes, sans contrepartie.
--   → Elle est migrée à l'ÉTAPE 6, avec `resolve_wa_bar_link` et
--     `request_wa_bar_link`, pour que les 3 objets du bot bougent ensemble.

-- IMPACT:
--   Tous les bars. AUCUN effet sur les données existantes : purement permissif.
--   Répartition au 01/09/2026 : serveur 59, gerant 18, promoteur 11,
--   cuisinier 1, super_admin 1. Aucun rôle inattendu.

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ TECHNICAL SOLUTION                                              │
-- └─────────────────────────────────────────────────────────────────┘

-- SOLUTION:
--   DROP + ADD des 2 contraintes avec 'co_promoteur' ajouté.
--   Noms résolus DYNAMIQUEMENT (pg_constraint) : on ne devine pas un nom
--   auto-généré par Postgres, on le lit. Même méthode que 20260802090000.

-- BREAKING_CHANGE: NO
--   Strictement permissif : chaque nouvelle contrainte accepte tout ce que
--   l'ancienne acceptait, plus une valeur. Aucune ligne existante ne peut la
--   violer (vérifié : aucun 'co_promoteur' en base au 01/09/2026).
--   DDL transactionnel : un échec sur la 2e contrainte annule la 1re.

-- ROLLBACK_STRATEGY:
--   ⚠ PRÉALABLE — le rollback ÉCHOUE si des lignes utilisent déjà le rôle.
--     Vérifier d'abord, et supprimer/réaffecter le cas échéant :
--       SELECT count(*) FROM public.bar_members     WHERE role = 'co_promoteur';
--       SELECT count(*) FROM public.training_versions WHERE role = 'co_promoteur';
--
--   ALTER TABLE public.bar_members DROP CONSTRAINT bar_members_role_check;
--   ALTER TABLE public.bar_members ADD CONSTRAINT bar_members_role_check
--     CHECK (role IN ('super_admin','promoteur','gerant','serveur','cuisinier'));
--   ALTER TABLE public.training_versions DROP CONSTRAINT training_versions_role_check;
--   ALTER TABLE public.training_versions ADD CONSTRAINT training_versions_role_check
--     CHECK (role IN ('promoteur','gerant','serveur','cuisinier'));

-- TABLES_MODIFIED: bar_members, training_versions
--                  (contraintes CHECK uniquement, AUCUNE donnée)
-- FUNCTIONS_MODIFIED: aucune · RLS_CHANGES: aucune

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL — à exécuter AVANT, dans le SQL Editor                  │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) État des 2 contraintes ciblées (noter les définitions pour comparaison) :
--
--    SELECT conrelid::regclass AS tbl, conname, pg_get_constraintdef(oid)
--    FROM pg_constraint
--    WHERE contype = 'c'
--      AND conrelid IN ('public.bar_members'::regclass,
--                       'public.training_versions'::regclass)
--      AND pg_get_constraintdef(oid) ILIKE '%promoteur%';
--    -- ATTENDU : 2 lignes, AUCUNE ne contenant 'co_promoteur'
--    -- ATTENDU : exactement 1 ligne par table (sinon la garde v_count > 1
--    --           interrompra la migration — c'est voulu)
--
-- 2) Répartition des rôles AVANT (à comparer au post-vol) :
--
--    SELECT role, count(*) FROM public.bar_members GROUP BY role ORDER BY role;
--    -- ATTENDU au 01/09/2026 : cuisinier 1, gerant 18, promoteur 11,
--    --                         serveur 59, super_admin 1
--
-- 3) Aucun co_promoteur préexistant (sinon le rollback serait bloqué) :
--
--    SELECT count(*) FROM public.bar_members WHERE role = 'co_promoteur';
--    -- ATTENDU : 0

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- 1/2 — bar_members.role
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_constraint_name TEXT;
  v_count INT;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_constraint
  WHERE conrelid = 'public.bar_members'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%promoteur%';

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Aucune contrainte CHECK mentionnant un rôle sur bar_members — schéma inattendu, migration interrompue';
  END IF;

  IF v_count > 1 THEN
    RAISE EXCEPTION 'Plusieurs contraintes CHECK mentionnant un rôle sur bar_members (%) — résoudre manuellement', v_count;
  END IF;

  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.bar_members'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%promoteur%';

  EXECUTE format('ALTER TABLE public.bar_members DROP CONSTRAINT %I', v_constraint_name);
  RAISE NOTICE '[1/2] bar_members : contrainte % supprimée', v_constraint_name;
END $$;

ALTER TABLE public.bar_members
  ADD CONSTRAINT bar_members_role_check
  CHECK (role IN ('super_admin', 'promoteur', 'co_promoteur', 'gerant', 'serveur', 'cuisinier'));

COMMENT ON CONSTRAINT bar_members_role_check ON public.bar_members IS
  'Rôles autorisés. ''co_promoteur'' ajouté le 2026-09-01 (PLAN_CO_PROMOTEUR.md) : '
  'associé agissant en l''absence du promoteur (urgence) et suivant la gestion. '
  '= gerant + 7 permissions, SANS canCreateBars. Le promoteur principal reste '
  'bars.owner_id (facturation, abonnement) — le co-promoteur ne le remplace pas.';

-- ═══════════════════════════════════════════════════════════════════
-- 2/2 — training_versions.role  (onboarding / guides du rôle)
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_constraint_name TEXT;
  v_count INT;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_constraint
  WHERE conrelid = 'public.training_versions'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%promoteur%';

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Aucune contrainte CHECK mentionnant un rôle sur training_versions — schéma inattendu';
  END IF;

  IF v_count > 1 THEN
    RAISE EXCEPTION 'Plusieurs contraintes CHECK mentionnant un rôle sur training_versions (%) — résoudre manuellement', v_count;
  END IF;

  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.training_versions'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%promoteur%';

  EXECUTE format('ALTER TABLE public.training_versions DROP CONSTRAINT %I', v_constraint_name);
  RAISE NOTICE '[2/2] training_versions : contrainte % supprimée', v_constraint_name;
END $$;

-- ⚠ 'super_admin' reste volontairement ABSENT ici (comme pour cuisinier,
--   cf. 20260802090100) : le super_admin ne suit pas de parcours de formation.
ALTER TABLE public.training_versions
  ADD CONSTRAINT training_versions_role_check
  CHECK (role IN ('promoteur', 'co_promoteur', 'gerant', 'serveur', 'cuisinier'));

COMMENT ON CONSTRAINT training_versions_role_check ON public.training_versions IS
  'Rôles pouvant suivre une formation. ''co_promoteur'' ajouté le 2026-09-01. '
  '''super_admin'' volontairement absent : pas de parcours de formation.';

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL — à exécuter APRÈS                                     │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) Les 2 contraintes acceptent bien 'co_promoteur' :
--
--    SELECT conrelid::regclass AS tbl, conname, pg_get_constraintdef(oid)
--    FROM pg_constraint
--    WHERE contype = 'c'
--      AND conrelid IN ('public.bar_members'::regclass,
--                       'public.training_versions'::regclass)
--      AND pg_get_constraintdef(oid) ILIKE '%promoteur%';
--    -- ATTENDU : 2 lignes, TOUTES contenant 'co_promoteur'
--
-- 2) Aucune donnée altérée (comparer au pré-vol 2) :
--
--    SELECT role, count(*) FROM public.bar_members GROUP BY role ORDER BY role;
--    -- ATTENDU : répartition IDENTIQUE au pré-vol
--
-- 3) ⭐ Test fonctionnel — À EXÉCUTER, puis ROLLBACK impérativement :
--
--    BEGIN;
--      -- doit RÉUSSIR (remplacer par des UUID réels d'un bar de test) :
--      -- INSERT INTO public.bar_members (bar_id, user_id, role, is_active)
--      -- VALUES ('<bar>', '<user>', 'co_promoteur', true);
--      -- doit ÉCHOUER (violation de contrainte) :
--      -- INSERT INTO public.bar_members (bar_id, user_id, role, is_active)
--      -- VALUES ('<bar>', '<user>', 'copromoteur', true);
--    ROLLBACK;
--    -- ⚠ TOUJOURS ROLLBACK : ce test ne doit rien laisser en base.
--    -- ⚠ Le 2e INSERT valide l'orthographe EXACTE : 'co_promoteur' avec
--    --   underscore. Toute autre graphie doit être rejetée.
--
-- ⚠ RAPPEL — à ce stade le rôle est LÉGAL en base mais TOTALEMENT INEXPLOITABLE :
--    - `add_bar_member_v2` le refuse (étape 3/8) ;
--    - les RLS ne lui donnent aucun droit au-delà d'un membre simple (étape 4/8) ;
--    - les 14 whitelists de RPC le rejettent, dont create_sale_idempotent :
--      il ne pourrait PAS encaisser (étapes 5 à 7) ;
--    - le bot WhatsApp le refuse, et son CHECK role_snapshot aussi (étape 6/8) ;
--    - `UserRole` TypeScript ne le connaît pas et la navigation l'ignore :
--      il verrait un MENU VIDE (étape 8).
--    → NE PAS créer de co-promoteur réel avant la fin de l'étape 8.
