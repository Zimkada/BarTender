-- Migration: Harden member management security
-- Date: 2026-02-27
--
-- Fixes (5 findings from security audit) :
--
-- FIX 1 — add_bar_member_v2 : utilise auth.uid() au lieu de p_assigned_by_id
--   p_assigned_by_id était fourni par le client → un appelant pouvait forger l'UUID
--   d'un owner/super_admin pour passer le check de permission.
--   Fix : ignorer p_assigned_by_id, utiliser auth.uid() pour le check et l'audit.
--   Le paramètre est conservé dans la signature pour la compatibilité ascendante.
--
-- FIX 2 — add_bar_member_v2 : valider p_role IN ('gerant', 'serveur')
--   La logique IF p_role = 'gerant' ELSE mappait tout le reste à 'create_server',
--   permettant à un gérant de créer un 'promoteur' ou 'super_admin' via ce RPC.
--   Fix : rejeter explicitement tout rôle hors ('gerant', 'serveur').
--
-- FIX 3 — remove_bar_member_v2 : utilise auth.uid() au lieu de p_removed_by_id
--   Même vecteur que FIX 1.
--
-- FIX 4 — remove_bar_member_v2 : bloquer le retrait de promoteur/super_admin par gérant
--   La protection n'existait que pour v_target_role = 'gerant'.
--   Un gérant pouvait retirer un promoteur ou super_admin.
--   Fix : étendre la protection à 'promoteur' et 'super_admin'.
--
-- FIX 5 — DROP "Managers can update members" (ancienne policy UPDATE permissive)
--   Cette policy (créée dans 20251213_enable_rls_bypass_for_impersonation.sql)
--   n'a jamais été supprimée. Elle neutralisait le hardening de 20260218000000
--   car en mode permissif (OR) elle court-circuitait le WITH CHECK restrictif.
--   La fonctionnalité is_impersonating() est désactivée (useApiQuery.ts l.33 = undefined),
--   la suppression n'a donc aucun impact fonctionnel.
--
-- FIX 6 — get_all_bar_members : guard super_admin interne
--   GRANT EXECUTE à authenticated sans vérification interne → tout utilisateur
--   authentifié pouvait lire l'annuaire complet (noms, emails, téléphones) de tous les bars.
--
-- FIX 7 — bar_members_update_policy : restreindre USING côté gérant
--   La policy de 20260218000000 restreignait le WITH CHECK (rôle final = serveur) mais
--   laissait le USING ouvert à tous les gérants/promoteurs sans filtrer la ligne cible.
--   Un gérant pouvait donc cibler une ligne promoteur et la rétrograder en serveur
--   via UPDATE direct, contournant les protections RPC.
--   Fix : USING restreint pour gérant aux seules lignes dont le rôle courant est 'serveur'.
--   Promoteur et super_admin conservent un USING complet sur leur bar.

-- =====================================================
-- FIX 5 : DROP ancienne policy UPDATE permissive
-- (en premier pour éviter toute fenêtre de vulnérabilité)
-- =====================================================

DROP POLICY IF EXISTS "Managers can update members" ON public.bar_members;
-- Blindage multi-historique : droppée dans 20260218000000 mais ajoutée ici par sécurité
-- pour les environnements où 20260218000000 n'aurait pas été appliquée correctement.
DROP POLICY IF EXISTS "Promoteurs can update bar members" ON public.bar_members;

-- =====================================================
-- FIX 7 : Resserrer bar_members_update_policy (USING + WITH CHECK)
-- =====================================================

DROP POLICY IF EXISTS "bar_members_update_policy" ON public.bar_members;

CREATE POLICY "bar_members_update_policy"
  ON public.bar_members FOR UPDATE
  USING (
    is_super_admin() OR
    get_user_role(bar_id) = 'promoteur' OR
    -- Gérant : ne peut cibler que des lignes dont le rôle courant est déjà 'serveur'
    -- (empêche de rétrograder un promoteur en serveur via UPDATE direct)
    (get_user_role(bar_id) = 'gerant' AND role = 'serveur')
  )
  WITH CHECK (
    is_super_admin() OR
    get_user_role(bar_id) = 'promoteur' OR
    -- Gérant : le rôle final doit également être 'serveur'
    (get_user_role(bar_id) = 'gerant' AND role = 'serveur')
  );

-- =====================================================
-- FIX 1 + 2 : add_bar_member_v2
-- =====================================================

CREATE OR REPLACE FUNCTION public.add_bar_member_v2(
  p_bar_id        UUID,
  p_user_id       UUID,
  p_role          TEXT,
  p_assigned_by_id UUID  -- Conservé pour compatibilité ascendante, ignoré en interne
)
RETURNS JSONB AS $$
DECLARE
  v_actor_id  UUID;
  v_user_name TEXT;
  v_can_manage BOOLEAN;
  v_member_id  UUID;
  v_action     TEXT;
BEGIN
  -- FIX 1 : utiliser auth.uid() comme acteur réel, ignorer p_assigned_by_id
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentification requise');
  END IF;

  -- FIX 2 : rejeter tout rôle hors du périmètre autorisé
  IF p_role NOT IN ('gerant', 'serveur') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Rôle invalide: "%s". Seuls gerant et serveur sont autorisés via ce RPC.', p_role)
    );
  END IF;

  -- Déterminer l'action selon le rôle cible
  IF p_role = 'gerant' THEN
    v_action := 'create_manager';
  ELSE
    v_action := 'create_server';
  END IF;

  -- Vérifier les permissions de l'acteur réel
  v_can_manage := public.check_user_can_manage_members(p_bar_id, v_actor_id, v_action);
  IF NOT v_can_manage THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission refusée pour cette action');
  END IF;

  -- Récupérer le nom de l'utilisateur cible
  SELECT name INTO v_user_name FROM public.users WHERE id = p_user_id;
  IF v_user_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Utilisateur introuvable');
  END IF;

  -- Détection de collision sur les mappings de nom serveur
  IF p_role = 'serveur' THEN
    IF EXISTS (
      SELECT 1 FROM public.server_name_mappings
      WHERE bar_id = p_bar_id
        AND server_name = v_user_name
        AND user_id != p_user_id
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Le nom "%s" est déjà utilisé par un autre serveur dans ce bar.', v_user_name)
      );
    END IF;
  END IF;

  -- Insert / Upsert membre
  INSERT INTO public.bar_members (bar_id, user_id, role, assigned_by, is_active, joined_at)
  VALUES (p_bar_id, p_user_id, p_role, v_actor_id, TRUE, NOW())
  ON CONFLICT (bar_id, user_id) WHERE user_id IS NOT NULL
  DO UPDATE SET
    role        = EXCLUDED.role,
    is_active   = TRUE,
    assigned_by = EXCLUDED.assigned_by
  RETURNING id INTO v_member_id;

  -- Auto-créer le mapping serveur
  IF p_role = 'serveur' THEN
    INSERT INTO public.server_name_mappings (bar_id, user_id, server_name, created_at, updated_at)
    VALUES (p_bar_id, p_user_id, v_user_name, NOW(), NOW())
    ON CONFLICT (bar_id, server_name) DO NOTHING;
  END IF;

  -- Audit log (acteur réel = v_actor_id)
  PERFORM public.internal_log_audit_event(
    'MEMBER_ADDED',
    'info',
    v_actor_id,
    p_bar_id,
    format('Ajout du membre %s (%s)', v_user_name, p_role),
    jsonb_build_object('target_user_id', p_user_id, 'role', p_role, 'member_id', v_member_id),
    p_user_id,
    'user'
  );

  RETURN jsonb_build_object('success', true, 'member_id', v_member_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.add_bar_member_v2 IS
  'Ajout atomique de membre. FIX: auth.uid() remplace p_assigned_by_id (anti-spoof). '
  'p_role validé IN (gerant, serveur). p_assigned_by_id conservé pour compat ascendante.';

-- =====================================================
-- FIX 3 + 4 : remove_bar_member_v2
-- =====================================================

CREATE OR REPLACE FUNCTION public.remove_bar_member_v2(
  p_bar_id            UUID,
  p_user_id_to_remove UUID,
  p_removed_by_id     UUID  -- Conservé pour compatibilité ascendante, ignoré en interne
)
RETURNS JSONB AS $$
DECLARE
  v_actor_id        UUID;
  v_target_role     TEXT;
  v_can_manage      BOOLEAN;
  v_can_remove      BOOLEAN;
  v_user_name       TEXT;
BEGIN
  -- FIX 3 : utiliser auth.uid() comme acteur réel, ignorer p_removed_by_id
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentification requise');
  END IF;

  -- Récupérer le rôle et le nom de la cible
  SELECT bm.role, u.name INTO v_target_role, v_user_name
  FROM public.bar_members bm
  JOIN public.users u ON u.id = bm.user_id
  WHERE bm.bar_id = p_bar_id AND bm.user_id = p_user_id_to_remove;

  IF v_target_role IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Membre introuvable');
  END IF;

  -- FIX 4 : bloquer le retrait de promoteur et super_admin sauf owner/super_admin
  IF v_target_role IN ('promoteur', 'super_admin') THEN
    IF NOT EXISTS (SELECT 1 FROM public.bars WHERE id = p_bar_id AND owner_id = v_actor_id)
       AND NOT EXISTS (
         SELECT 1 FROM public.bar_members
         WHERE user_id = v_actor_id AND role = 'super_admin' AND is_active = TRUE
       ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Seul le propriétaire ou un Super Admin peut retirer un promoteur ou super_admin.'
      );
    END IF;
    v_can_remove := TRUE;

  ELSIF v_target_role = 'gerant' THEN
    -- Protection existante : seul owner ou super_admin peut retirer un gérant
    IF NOT EXISTS (SELECT 1 FROM public.bars WHERE id = p_bar_id AND owner_id = v_actor_id)
       AND NOT EXISTS (
         SELECT 1 FROM public.bar_members
         WHERE user_id = v_actor_id AND role = 'super_admin' AND is_active = TRUE
       ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Seul le propriétaire ou un Super Admin peut retirer un gérant.'
      );
    END IF;
    v_can_remove := TRUE;

  ELSE
    -- Cible est serveur : permission générale gerant/promoteur suffit
    v_can_manage := public.check_user_can_manage_members(p_bar_id, v_actor_id, 'remove_member');
    v_can_remove := v_can_manage;
  END IF;

  IF NOT v_can_remove THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission refusée: vous ne pouvez pas supprimer ce membre');
  END IF;

  -- Soft delete
  UPDATE public.bar_members
  SET is_active = FALSE
  WHERE bar_id = p_bar_id AND user_id = p_user_id_to_remove;

  -- Audit log (acteur réel = v_actor_id)
  PERFORM public.internal_log_audit_event(
    'MEMBER_REMOVED',
    'warning',
    v_actor_id,
    p_bar_id,
    format('Suppression du membre %s', v_user_name),
    jsonb_build_object('target_user_id', p_user_id_to_remove, 'role', v_target_role),
    p_user_id_to_remove,
    'user'
  );

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.remove_bar_member_v2 IS
  'Suppression atomique de membre. FIX: auth.uid() remplace p_removed_by_id (anti-spoof). '
  'Promoteur et super_admin protégés contre retrait par gérant. '
  'p_removed_by_id conservé pour compat ascendante.';

-- =====================================================
-- FIX 6 : get_all_bar_members — guard super_admin interne
-- =====================================================

CREATE OR REPLACE FUNCTION get_all_bar_members()
RETURNS TABLE (
  id             UUID,
  user_id        UUID,
  bar_id         UUID,
  role           TEXT,
  assigned_by    UUID,
  joined_at      TIMESTAMPTZ,
  is_active      BOOLEAN,
  user_id_inner  UUID,
  username       TEXT,
  name           TEXT,
  phone          TEXT,
  email          TEXT,
  avatar_url     TEXT,
  user_is_active BOOLEAN,
  first_login    BOOLEAN,
  created_at     TIMESTAMPTZ,
  last_login_at  TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Guard : réservé aux super_admin uniquement
  IF NOT EXISTS (
    SELECT 1 FROM bar_members
    WHERE user_id = auth.uid() AND role = 'super_admin' AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Permission refusée: Super Admin requis pour accéder à l''annuaire global';
  END IF;

  RETURN QUERY
  SELECT
    bm.id,
    bm.user_id,
    bm.bar_id,
    bm.role,
    bm.assigned_by,
    bm.joined_at,
    bm.is_active,
    u.id,
    u.username,
    u.name,
    u.phone,
    u.email,
    u.avatar_url,
    u.is_active,
    u.first_login,
    u.created_at,
    u.last_login_at
  FROM bar_members bm
  JOIN users u ON bm.user_id = u.id;
END;
$$;

COMMENT ON FUNCTION get_all_bar_members IS
  'Annuaire global tous bars. Réservé super_admin (guard interne auth.uid()). '
  'FIX: GRANT authenticated conservé pour compat PostgREST, guard SQL bloque les non-super_admin.';

NOTIFY pgrst, 'reload schema';
