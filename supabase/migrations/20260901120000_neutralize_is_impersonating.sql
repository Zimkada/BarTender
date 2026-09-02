-- ===================================================================
-- 🛡️ CORRECTIF DE SÉCURITÉ — neutralisation de is_impersonating()
-- DATE: 2026-09-01
-- AUTHOR: AI Assistant
-- SÉVÉRITÉ: ÉLEVÉE — élévation de privilège auto-attribuable
-- ORIGINE: découvert en revue du correctif 20260901110000. SANS RAPPORT avec
--          le chantier co-promoteur : faille préexistante depuis 20251213.
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ LA FAILLE                                                       │
-- └─────────────────────────────────────────────────────────────────┘

-- `is_impersonating()` (20251213_enable_rls_bypass_for_impersonation.sql:8) :
--
--   SELECT auth.jwt()->'user_metadata'->>'impersonation' = 'true';
--
-- ⚠️ `user_metadata` est MODIFIABLE PAR L'UTILISATEUR LUI-MÊME via
--    `supabase.auth.updateUser({ data: { ... } })`. C'est la différence
--    fondamentale avec `app_metadata`, écrivable seulement côté serveur
--    (service_role). Supabase documente explicitement que `user_metadata` ne
--    doit JAMAIS porter une décision d'autorisation.
--
-- IMPACT RÉEL :
--   N'importe quel utilisateur authentifié — y compris un simple serveur —
--   peut exécuter depuis le navigateur :
--
--     await supabase.auth.updateUser({ data: { impersonation: 'true' } })
--
--   Après rafraîchissement du token, `is_impersonating()` retourne TRUE pour
--   lui. Cette fonction apparaît dans **64 clauses de policies RLS**, dont
--   « Managers can add members » (INSERT sur bar_members) : il pourrait alors
--   s'ajouter comme promoteur de son propre bar, puis accéder à la
--   comptabilité, aux dépenses et aux salaires.
--
-- AGGRAVANT — la fonctionnalité n'existe PLUS côté application :
--   `src/hooks/queries/useApiQuery.ts:30` porte
--     `const impersonatingUserId = undefined; // TODO: Restore this when ...`
--   L'impersonation est désactivée, mais ses 64 portes RLS sont restées
--   ouvertes. Le mécanisme réellement utilisé aujourd'hui est différent :
--   des paramètres `p_impersonating_user_id` passés explicitement à certains
--   RPC — il ne dépend PAS de cette fonction.

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POURQUOI NEUTRALISER PLUTÔT QUE SUPPRIMER                       │
-- └─────────────────────────────────────────────────────────────────┘

-- Un DROP exigerait de réécrire les 64 policies qui la référencent : diff
-- massif, risque de régression élevé, et impossible à relire sérieusement.
--
-- On remplace le CORPS par `SELECT false` :
--   · les 64 policies restent inchangées, aucune n'est touchée ;
--   · leur branche `OR is_impersonating()` devient inerte ;
--   · les autres branches (is_super_admin, get_user_role(bar_id)) continuent
--     de fonctionner à l'identique → aucun droit légitime perdu ;
--   · réversible en une commande.
--
-- ⭐ VÉRIFIÉ AVANT (01/09/2026) : aucun code de l'application n'écrit
--    `user_metadata.impersonation` — ni le front (`src/`), ni les Edge
--    Functions. Le drapeau ne peut donc être posé QUE par un utilisateur
--    agissant sur son propre compte. Neutraliser la fonction ne casse aucun
--    flux légitime : il n'en existe aucun.

-- BREAKING_CHANGE: NO
--   Aucun flux ne pose le drapeau, donc aucune policy ne s'appuie réellement
--   sur cette branche aujourd'hui. Si un flux admin devait un jour reposer sur
--   l'impersonation, le rétablir passerait par `app_metadata` (cf. plus bas),
--   jamais par `user_metadata`.

-- ROLLBACK_STRATEGY:
--   CREATE OR REPLACE FUNCTION public.is_impersonating() RETURNS BOOLEAN AS $$
--     SELECT auth.jwt()->'user_metadata'->>'impersonation' = 'true';
--   $$ LANGUAGE SQL STABLE;
--   ⚠ Rétablit la faille. Ne JAMAIS revenir à cette version : si
--     l'impersonation doit renaître, lire `app_metadata` et non `user_metadata`.

-- TABLES_MODIFIED: aucune · RLS_CHANGES: aucune (0 policy modifiée)
-- FUNCTIONS_MODIFIED: is_impersonating (corps uniquement, signature inchangée)

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL — à exécuter AVANT                                      │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) Corps actuel (archive de rollback) + confirmation de la source lue :
--
--    SELECT pg_get_functiondef(oid) FROM pg_proc
--    WHERE pronamespace='public'::regnamespace AND proname='is_impersonating';
--    -- ATTENDU : un corps contenant `user_metadata` → la faille est présente
--    -- ⚠ S'il contient déjà `app_metadata` ou `false` : NE PAS EXÉCUTER,
--    --   quelqu'un est déjà passé par là. Me le signaler.
--
-- 2) Ampleur réelle — combien de policies s'appuient dessus :
--
--    SELECT count(*) AS nb_policies
--    FROM pg_policies
--    WHERE schemaname='public'
--      AND COALESCE(qual,'')||COALESCE(with_check,'') ILIKE '%is_impersonating%';
--    -- ATTENDU : un nombre élevé (~30-64 selon le décompte des clauses).
--    --   AUCUNE ne sera modifiée : c'est la mesure de ce qui devient inerte.
--
-- 3) ⭐ Y a-t-il des comptes portant DÉJÀ le drapeau ?
--    (= quelqu'un s'est-il auto-attribué le privilège ?)
--
--    SELECT id, email, raw_user_meta_data->>'impersonation' AS flag
--    FROM auth.users
--    WHERE raw_user_meta_data->>'impersonation' IS NOT NULL;
--    -- ATTENDU : 0 ligne.
--    -- ⛔ Toute ligne ici = drapeau posé sur un compte réel. Ce n'est PAS
--    --    forcément malveillant (test, débogage), mais à élucider : le
--    --    compte concerné dispose aujourd'hui de droits élargis.

BEGIN;

-- 🛡️ Garde : ne pas écraser une correction déjà appliquée par ailleurs.
DO $$
DECLARE
  v_def TEXT;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_def
  FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace AND proname = 'is_impersonating';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'is_impersonating() introuvable — schéma inattendu, migration interrompue';
  END IF;

  IF v_def NOT ILIKE '%user_metadata%' THEN
    RAISE EXCEPTION
      'is_impersonating() ne lit plus user_metadata — une correction a déjà été '
      'appliquée. Vérifier avant de continuer (migration interrompue).';
  END IF;
END $$;

-- Neutralisation : le corps devient constant.
--   `CREATE OR REPLACE` (pas de DROP) : la signature ne change pas, les 64
--   policies qui la référencent restent valides sans être touchées.
CREATE OR REPLACE FUNCTION public.is_impersonating()
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT false;
$$;

COMMENT ON FUNCTION public.is_impersonating() IS
'⛔ NEUTRALISÉE le 2026-09-01 (correctif de sécurité) — retourne toujours FALSE. '
'Lisait auparavant auth.jwt()->''user_metadata''->>''impersonation'', or user_metadata '
'est MODIFIABLE PAR L''UTILISATEUR via supabase.auth.updateUser() : n''importe quel '
'compte authentifié pouvait s''auto-attribuer le privilège et activer les ~64 branches '
'RLS « OR is_impersonating() », dont l''INSERT sur bar_members. '
'La fonctionnalité était déjà désactivée côté application (useApiQuery.ts) et aucun code '
'n''écrivait ce drapeau. Conservée plutôt que supprimée pour ne pas réécrire 64 policies. '
'⚠️ Si l''impersonation doit renaître : lire app_metadata (écrivable côté serveur '
'UNIQUEMENT), JAMAIS user_metadata.';

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL — à exécuter APRÈS                                     │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) La fonction retourne bien FALSE, et ne lit plus le JWT :
--
--    SELECT public.is_impersonating() AS doit_etre_false,
--           pg_get_functiondef(p.oid) ILIKE '%user_metadata%' AS lit_encore_jwt
--    FROM pg_proc p
--    WHERE p.pronamespace='public'::regnamespace AND p.proname='is_impersonating';
--    -- ATTENDU : doit_etre_false = false · lit_encore_jwt = false
--
-- 2) Aucune policy n'a été cassée (le compte doit être IDENTIQUE au pré-vol 2) :
--
--    SELECT count(*) AS nb_policies
--    FROM pg_policies
--    WHERE schemaname='public'
--      AND COALESCE(qual,'')||COALESCE(with_check,'') ILIKE '%is_impersonating%';
--    -- ATTENDU : le MÊME nombre qu'au pré-vol — on neutralise, on ne réécrit pas.
--
-- 3) ⭐ NON-RÉGRESSION — à vérifier depuis l'UI (auth.uid() réel) :
--      · promoteur  → voit ses ventes, stocks, comptabilité       → OK
--      · gérant     → ajoute un serveur, gère l'inventaire        → OK
--      · serveur    → encaisse une vente                          → OK
--      · super_admin→ accède au dashboard admin, ouvre un bar     → OK
--    Ces droits passent tous par is_super_admin() ou get_user_role(bar_id),
--    JAMAIS par la branche neutralisée. Le test confirme l'analyse.

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ SUITE — dette de sécurité restante (hors périmètre)              │
-- └─────────────────────────────────────────────────────────────────┘
--
-- Deux fonctions de la même famille restent défaillantes :
--
--   · `is_promoteur_or_admin()` — pas de filtre bar_id. Après 20260901110000
--     elle ne sert plus à aucune écriture sur bar_members, mais subsiste dans
--     « users / Admins can create users » (INSERT) : **à auditer** — un
--     promoteur peut-il créer un utilisateur arbitraire ?
--
--   · `is_super_admin()` — LIMIT 1 sans ORDER BY ni filtre bar_id, 431 usages.
--     Déterministe uniquement parce que l'unique super_admin n'a qu'une ligne
--     active. Voir mémoire `project_is_super_admin_fragile`.
--
-- → Une passe dédiée « helpers RLS » serait plus efficace qu'un traitement au
--   cas par cas : ces trois défauts viennent des mêmes migrations d'origine
--   (002, 009, 20251213) et relèvent du même schéma de pensée.
