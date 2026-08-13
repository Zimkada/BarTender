-- ===================================================================
-- MIGRATION: add_bar_member_v2 accepte le rôle 'cuisinier'
-- DATE: 2026-08-02
-- AUTHOR: AI Assistant
-- PHASE: 0 du module restauration (réponse Q1 de MATRICE_RBAC_CUISINIER.md §7)
-- ORDRE: 4/4 — EN DERNIER (dépend de 1/4 et 3/4)
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BUSINESS CONTEXT                                                │
-- └─────────────────────────────────────────────────────────────────┘

-- PROBLEM:
--   `add_bar_member_v2` est le RPC qu'utilise l'UI pour ajouter un membre ET
--   changer un rôle. Il rejette explicitement toute valeur hors ('gerant','serveur') :
--
--     IF p_role NOT IN ('gerant', 'serveur') THEN
--       RETURN ... 'Rôle invalide: "%s". Seuls gerant et serveur sont autorisés via ce RPC.'
--
--   C'est le DERNIER verrou : contrainte CHECK (1/4) et RLS (3/4) peuvent être
--   ouvertes, l'UI resterait incapable de créer un cuisinier.

-- IMPACT:
--   Tous les bars. AUCUN changement pour les rôles existants.

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ TECHNICAL SOLUTION                                              │
-- └─────────────────────────────────────────────────────────────────┘

-- SOLUTION:
--   Deux modifications, et deux seulement :
--     (1) la liste des rôles acceptés : + 'cuisinier'
--     (2) le mapping p_role → action de permission : 'cuisinier' → 'create_server'
--
--   ⭐ Sur (2) : `check_user_can_manage_members` (20260220000000) ne connaît que
--   les actions 'create_manager' | 'create_server' | 'remove_member' | 'update_role'.
--   'create_server' retourne `v_user_role IN ('gerant','promoteur')` — exactement
--   la règle voulue pour le cuisinier (Q1 : le gérant peut le créer).
--   On RÉUTILISE donc cette action au lieu d'en inventer une : créer
--   'create_kitchen_staff' obligerait à modifier `check_user_can_manage_members`
--   pour une valeur de retour IDENTIQUE — un point de désynchronisation gratuit.

-- ⚠ CERTIFICATION AVANT ÉCRITURE :
--   Corps ci-dessous = copie EXACTE de la version en vigueur
--   (20260727010000_sync_server_mappings_on_member_change.sql, dernière des 5
--   migrations qui font CREATE OR REPLACE sur cette fonction — grep du 02/08/2026).
--   Sont donc préservés : plan limit check, garde anti-downgrade promoteur/gérant,
--   gardes de collision de mappings (b) et (c), UPSERT, audit log, SET search_path.
--   SEULES LIGNES MODIFIÉES : le IF de validation et le mapping d'action.

-- ⚠ Le bloc `IF p_role = 'serveur' THEN ... server_name_mappings ...` est
--   VOLONTAIREMENT laissé tel quel : un cuisinier ne prend pas de commande, il
--   n'a donc pas de mapping de nom de serveur. Ne PAS l'étendre à 'cuisinier'.

-- BREAKING_CHANGE: NO — additif.

-- ROLLBACK_STRATEGY:
--   Rejouer 20260727010000_sync_server_mappings_on_member_change.sql (étape 4).
--   ⚠ Ce fichier contient AUSSI d'autres étapes (trigger, backfill) : n'en rejouer
--   que le bloc CREATE OR REPLACE FUNCTION public.add_bar_member_v2 + ses GRANT.

-- FUNCTIONS_MODIFIED: public.add_bar_member_v2 (CREATE OR REPLACE)
-- TABLES_MODIFIED: aucune · RLS_CHANGES: aucune

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL                                                         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ⛔ PRÉREQUIS BLOQUANTS — 1/4 et 3/4 doivent être appliquées :
--
--    SELECT
--      (SELECT bool_or(pg_get_constraintdef(oid) ILIKE '%cuisinier%')
--       FROM pg_constraint
--       WHERE conrelid = 'public.bar_members'::regclass AND contype = 'c') AS check_ok,
--      (SELECT bool_or(pg_get_expr(polwithcheck, polrelid) ILIKE '%cuisinier%')
--       FROM pg_policy
--       WHERE polrelid = 'public.bar_members'::regclass AND polcmd = 'w') AS rls_ok;
--    -- ATTENDU : check_ok = true ET rls_ok = true
--
-- 1) Une seule version + signature exacte :
--
--    SELECT p.oid, pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef, p.proconfig
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'add_bar_member_v2';
--    -- ATTENDU : 1 ligne · args = uuid, uuid, text, uuid · prosecdef = true
--    --           proconfig contenant search_path=public, extensions
--
-- 2) Privilèges AVANT (référence du post-vol) :
--
--    SELECT has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
--           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_role,
--           has_function_privilege('service_role',  p.oid, 'EXECUTE') AS svc
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'add_bar_member_v2';
--    -- ⭐ RELEVÉ EN PROD le 02/08/2026 : anon=false, auth_role=true, svc=FALSE
--    --    ⚠ svc=false est VOULU et doit le RESTER : ce RPC est appelé depuis
--    --    l'UI authentifiée, jamais par SyncManager. Le REVOKE FROM PUBLIC
--    --    ci-dessous reproduit cet état (service_role hérite de PUBLIC), et le
--    --    GRANT ne vise QUE authenticated. Post-vol : les 3 valeurs identiques.
--
-- 3) Archiver le corps actuel (filet de rollback réel) :
--
--    SELECT pg_get_functiondef(p.oid)
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'add_bar_member_v2';
--
-- 4) La fonction de permission expose bien l'action réutilisée :
--
--    SELECT prosrc LIKE '%create_server%' AS action_ok
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'check_user_can_manage_members';
--    -- ATTENDU : true

BEGIN;

-- Garde-fou : refuser si les migrations 1/4 et 3/4 ne sont pas jouées.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.bar_members'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%cuisinier%'
  ) THEN
    RAISE EXCEPTION 'Migration 1/4 (contrainte CHECK) non appliquée — exécuter 20260802090000 d''abord';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.bar_members'::regclass
      AND polcmd = 'w'
      AND pg_get_expr(polwithcheck, polrelid) ILIKE '%cuisinier%'
  ) THEN
    RAISE EXCEPTION 'Migration 3/4 (RLS bar_members) non appliquée — exécuter 20260802090200 d''abord';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.add_bar_member_v2(
  p_bar_id        UUID,
  p_user_id       UUID,
  p_role          TEXT,
  p_assigned_by_id UUID  -- Conservé pour compatibilité ascendante, ignoré en interne
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_actor_id     UUID;
  v_user_name    TEXT;
  v_can_manage   BOOLEAN;
  v_member_id    UUID;
  v_action       TEXT;
  v_existing_role TEXT;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentification requise');
  END IF;

  -- ⭐ 2026-08-02 : 'cuisinier' accepté (module restauration, §12.5).
  --    Rôle TRANSVERSAL de niveau 4, comme le serveur.
  IF p_role NOT IN ('gerant', 'serveur', 'cuisinier') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Rôle invalide: "%s". Seuls gerant, serveur et cuisinier sont autorisés via ce RPC.', p_role)
    );
  END IF;

  -- ⭐ Mapping rôle → action de permission.
  --    'cuisinier' réutilise 'create_server' : check_user_can_manage_members
  --    y retourne `role IN ('gerant','promoteur')`, exactement la règle Q1
  --    (le gérant peut créer un cuisinier). Créer une action dédiée dupliquerait
  --    une valeur de retour identique — point de désynchronisation gratuit.
  IF p_role = 'gerant' THEN
    v_action := 'create_manager';
  ELSE
    v_action := 'create_server';
  END IF;

  v_can_manage := public.check_user_can_manage_members(p_bar_id, v_actor_id, v_action);
  IF NOT v_can_manage THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission refusée pour cette action');
  END IF;

  -- ⭐ PLAN LIMIT CHECK
  -- ⚠️ Le cuisinier CONSOMME un siège (décision 31/07/2026) : check_plan_member_limit
  --    fait un COUNT(*) sans filtre de rôle, donc c'est déjà le comportement natif.
  IF public.check_plan_member_limit(p_bar_id, p_user_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Limite de membres atteinte pour le plan actuel. Contactez l''administrateur pour passer au plan supérieur.'
    );
  END IF;

  SELECT name INTO v_user_name FROM public.users WHERE id = p_user_id;
  IF v_user_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Utilisateur introuvable');
  END IF;

  SELECT role INTO v_existing_role
  FROM public.bar_members
  WHERE bar_id = p_bar_id AND user_id = p_user_id;

  IF v_existing_role IS NOT NULL THEN
    IF v_existing_role IN ('promoteur', 'super_admin') THEN
      IF NOT EXISTS (SELECT 1 FROM public.bars WHERE id = p_bar_id AND owner_id = v_actor_id)
         AND NOT EXISTS (
           SELECT 1 FROM public.bar_members
           WHERE user_id = v_actor_id AND role = 'super_admin' AND is_active = TRUE
         ) THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', format(
            'Impossible de modifier le rôle d''un %s. Seul le propriétaire ou un Super Admin peut effectuer cette action.',
            v_existing_role
          )
        );
      END IF;
    END IF;

    IF v_existing_role = 'gerant' AND p_role = 'serveur' THEN
      IF NOT EXISTS (SELECT 1 FROM public.bars WHERE id = p_bar_id AND owner_id = v_actor_id)
         AND NOT EXISTS (
           SELECT 1 FROM public.bar_members
           WHERE user_id = v_actor_id AND role = 'super_admin' AND is_active = TRUE
         ) THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Seul le propriétaire ou un Super Admin peut modifier le rôle d''un gérant.'
        );
      END IF;
    END IF;
  END IF;

  -- ⚠️ Bloc INCHANGÉ, volontairement limité à 'serveur' : un cuisinier ne prend
  --    pas de commande, il n'a donc PAS de server_name_mapping. Ne pas étendre.
  IF p_role = 'serveur' THEN
    -- ⭐ (b) Collision avec un serveur ACTIF : rejet (comportement inchangé).
    IF EXISTS (
      SELECT 1 FROM public.server_name_mappings
      WHERE bar_id = p_bar_id
        AND server_name = v_user_name
        AND user_id != p_user_id
        AND is_active = TRUE
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Le nom "%s" est déjà utilisé par un autre serveur dans ce bar.', v_user_name)
      );
    END IF;

    -- ⭐ (c) Collision avec un mapping INACTIF appartenant à quelqu'un d'autre.
    IF EXISTS (
      SELECT 1
      FROM public.server_name_mappings snm
      JOIN public.tickets t
        ON t.bar_id = snm.bar_id
       AND t.server_id = snm.user_id
       AND t.status = 'open'
      WHERE snm.bar_id = p_bar_id
        AND snm.server_name = v_user_name
        AND snm.user_id != p_user_id
        AND snm.is_active = FALSE
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format(
          'Le nom "%s" appartient à un ancien serveur qui a encore des bons ouverts. '
          'Soldez ces bons avant de réutiliser ce nom.',
          v_user_name
        )
      );
    END IF;
  END IF;

  INSERT INTO public.bar_members (bar_id, user_id, role, assigned_by, is_active, joined_at)
  VALUES (p_bar_id, p_user_id, p_role, v_actor_id, TRUE, NOW())
  ON CONFLICT (bar_id, user_id) WHERE user_id IS NOT NULL
  DO UPDATE SET
    role        = EXCLUDED.role,
    is_active   = TRUE,
    assigned_by = EXCLUDED.assigned_by
  RETURNING id INTO v_member_id;

  IF p_role = 'serveur' THEN
    INSERT INTO public.server_name_mappings (bar_id, user_id, server_name, is_active, created_at, updated_at)
    VALUES (p_bar_id, p_user_id, v_user_name, TRUE, NOW(), NOW())
    ON CONFLICT (bar_id, server_name)
    DO UPDATE SET
      user_id    = EXCLUDED.user_id,
      is_active  = TRUE,
      updated_at = NOW();
  END IF;

  PERFORM public.internal_log_audit_event(
    'MEMBER_ADDED',
    'info',
    v_actor_id,
    p_bar_id,
    format('Ajout/mise à jour du membre %s (%s)', v_user_name, p_role),
    jsonb_build_object('target_user_id', p_user_id, 'role', p_role, 'member_id', v_member_id),
    p_user_id,
    'user'
  );

  RETURN jsonb_build_object('success', true, 'member_id', v_member_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

COMMENT ON FUNCTION public.add_bar_member_v2 IS
  'Ajout/mise à jour atomique de membre. '
  'FIX 8: guard rôle existant avant UPSERT — bloque downgrade promoteur/gérant. '
  'FIX 2026-07-27: mapping en DO UPDATE + contrôle de collision ignorant les inactifs. '
  'FIX 2026-08-02: accepte ''cuisinier'' (module restauration) — réutilise l''action '
  '''create_server'' (gérant + promoteur), sans server_name_mapping.';

-- ⚠️ Réaffirmation des privilèges (leçon des Vagues 1-4).
REVOKE EXECUTE ON FUNCTION public.add_bar_member_v2(uuid, uuid, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.add_bar_member_v2(uuid, uuid, text, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.add_bar_member_v2(uuid, uuid, text, uuid) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL                                                        │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⚠ CRITIQUE — privilèges identiques au pré-vol (2) :
--
--    SELECT has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
--           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_role
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'add_bar_member_v2';
--    -- ⛔ Si anon = true : BRÈCHE. Rejouer le bloc REVOKE/GRANT.
--
-- 2) Version unique + durcissement préservé :
--
--    SELECT count(*) AS nb, bool_and(p.prosecdef) AS secdef,
--           bool_and(p.proconfig::text ILIKE '%search_path%') AS searchpath_ok
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'add_bar_member_v2';
--    -- ATTENDU : nb = 1, secdef = true, searchpath_ok = true
--
-- 3) 'cuisinier' accepté ET gardes préservées dans le corps déployé :
--
--    SELECT pg_get_functiondef(p.oid) ILIKE '%cuisinier%'                AS cuisinier_ok,
--           pg_get_functiondef(p.oid) ILIKE '%check_plan_member_limit%'  AS plan_limit_ok,
--           pg_get_functiondef(p.oid) ILIKE '%server_name_mappings%'     AS mappings_ok,
--           pg_get_functiondef(p.oid) ILIKE '%internal_log_audit_event%' AS audit_ok
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'add_bar_member_v2';
--    -- ATTENDU : les 4 à true (garde contre une copie tronquée du corps)
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ TESTS PAR L'UI                                                  │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ⚠ auth.uid() vaut NULL en SQL Editor → le RPC y répond « Authentification
--   requise ». Tests avec de vrais comptes uniquement.
--
-- ☐ Gérant   → crée un serveur              : OK                    [inchangé]
-- ☐ Gérant   → crée un CUISINIER            : OK                    [⭐ NOUVEAU]
-- ☐ Gérant   → crée un gérant               : REFUSÉ                [inchangé]
-- ☐ Promoteur→ crée un cuisinier            : OK                    [⭐ NOUVEAU]
-- ☐ Serveur  → tente de créer qui que ce soit : REFUSÉ              [inchangé]
-- ☐ Cuisinier créé sur bar au PLAFOND       : REFUSÉ « limite de membres »
-- ☐ Serveur requalifié en cuisinier         : OK, ne consomme PAS un 2e siège
-- ☐ Cuisinier créé → AUCUN server_name_mapping n'apparaît :
--      SELECT * FROM server_name_mappings WHERE user_id = '<uuid_cuisinier>';
--      -- ATTENDU : 0 ligne
-- ☐ Audit log alimenté :
--      SELECT * FROM audit_logs WHERE event = 'MEMBER_ADDED'
--      ORDER BY created_at DESC LIMIT 1;
