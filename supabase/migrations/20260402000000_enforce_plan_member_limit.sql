-- ============================================================================
-- Migration: Enforce plan member limit at database level
--
-- Adds a reusable helper function check_plan_member_limit() that reads
-- bars.settings->>'plan' and compares active member count against the plan's
-- maxMembers. This is called from add_bar_member_v2, add_bar_member_existing,
-- and assign_bar_member BEFORE inserting a new member.
--
-- Plan limits:
--   starter   → 2 members
--   pro       → 8 members
--   enterprise → 20 members
--   (unknown/null) → defaults to starter (2)
-- ============================================================================

-- Helper function: returns TRUE if adding a member would exceed the plan limit
CREATE OR REPLACE FUNCTION public.check_plan_member_limit(p_bar_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_plan TEXT;
  v_max_members INT;
  v_active_count INT;
  v_already_member BOOLEAN;
BEGIN
  -- If user is already an active member of this bar, no limit check needed (role update)
  SELECT EXISTS (
    SELECT 1 FROM public.bar_members
    WHERE bar_id = p_bar_id AND user_id = p_user_id AND is_active = TRUE
  ) INTO v_already_member;

  IF v_already_member THEN
    RETURN FALSE; -- Not exceeding limit, it's a role update
  END IF;

  -- Read plan from bar settings + lock row to serialize concurrent member additions
  SELECT COALESCE(settings->>'plan', 'starter')
  INTO v_plan
  FROM public.bars
  WHERE id = p_bar_id
  FOR UPDATE;

  -- Map plan to max members
  v_max_members := CASE v_plan
    WHEN 'enterprise' THEN 20
    WHEN 'pro' THEN 8
    ELSE 2  -- starter or unknown
  END;

  -- Count current active members
  SELECT COUNT(*)
  INTO v_active_count
  FROM public.bar_members
  WHERE bar_id = p_bar_id AND is_active = TRUE;

  RETURN v_active_count >= v_max_members;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Patch add_bar_member_v2: add plan check after permission check
-- ============================================================================
CREATE OR REPLACE FUNCTION public.add_bar_member_v2(
  p_bar_id        UUID,
  p_user_id       UUID,
  p_role          TEXT,
  p_assigned_by_id UUID
)
RETURNS JSONB AS $$
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

  IF p_role NOT IN ('gerant', 'serveur') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Rôle invalide: "%s". Seuls gerant et serveur sont autorisés via ce RPC.', p_role)
    );
  END IF;

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

  INSERT INTO public.bar_members (bar_id, user_id, role, assigned_by, is_active, joined_at)
  VALUES (p_bar_id, p_user_id, p_role, v_actor_id, TRUE, NOW())
  ON CONFLICT (bar_id, user_id) WHERE user_id IS NOT NULL
  DO UPDATE SET
    role        = EXCLUDED.role,
    is_active   = TRUE,
    assigned_by = EXCLUDED.assigned_by
  RETURNING id INTO v_member_id;

  IF p_role = 'serveur' THEN
    INSERT INTO public.server_name_mappings (bar_id, user_id, server_name, created_at, updated_at)
    VALUES (p_bar_id, p_user_id, v_user_name, NOW(), NOW())
    ON CONFLICT (bar_id, server_name) DO NOTHING;
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Patch add_bar_member_existing: add plan check
-- ============================================================================
CREATE OR REPLACE FUNCTION add_bar_member_existing(
  p_bar_id UUID,
  p_user_id UUID DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_role TEXT DEFAULT 'serveur'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_target_user_id UUID;
  v_req_user_id UUID;
  v_is_owner BOOLEAN;
  v_req_role TEXT;
BEGIN
  v_req_user_id := auth.uid();

  IF p_user_id IS NOT NULL THEN
    v_target_user_id := p_user_id;
  ELSIF p_email IS NOT NULL THEN
    SELECT id INTO v_target_user_id FROM users WHERE email = p_email;
    IF v_target_user_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Utilisateur introuvable avec cet email.');
    END IF;
  ELSE
     RETURN jsonb_build_object('success', false, 'error', 'User ID ou Email requis.');
  END IF;

  SELECT (owner_id = v_req_user_id) INTO v_is_owner FROM bars WHERE id = p_bar_id;

  IF NOT v_is_owner THEN
     SELECT role INTO v_req_role FROM bar_members WHERE user_id = v_req_user_id AND bar_id = p_bar_id AND is_active = true;

     IF v_req_role = 'gerant' THEN
        IF p_role != 'serveur' THEN
           RETURN jsonb_build_object('success', false, 'error', 'Les gérants ne peuvent ajouter que des serveurs.');
        END IF;
     ELSIF v_req_role != 'super_admin' AND v_req_role != 'promoteur' THEN
         RETURN jsonb_build_object('success', false, 'error', 'Permission refusée.');
     END IF;
  END IF;

  -- ⭐ PLAN LIMIT CHECK
  IF public.check_plan_member_limit(p_bar_id, v_target_user_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Limite de membres atteinte pour le plan actuel. Contactez l''administrateur pour passer au plan supérieur.'
    );
  END IF;

  IF EXISTS (SELECT 1 FROM bar_members WHERE bar_id = p_bar_id AND user_id = v_target_user_id) THEN
     UPDATE bar_members
     SET is_active = true, role = p_role, assigned_at = NOW()
     WHERE bar_id = p_bar_id AND user_id = v_target_user_id;

     RETURN jsonb_build_object('success', true, 'message', 'Membre réactivé avec succès.');
  ELSE
     INSERT INTO bar_members (bar_id, user_id, role, assigned_by, is_active)
     VALUES (p_bar_id, v_target_user_id, p_role, v_req_user_id, true);

     RETURN jsonb_build_object('success', true, 'message', 'Membre ajouté avec succès.');
  END IF;

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ============================================================================
-- Patch assign_bar_member: add plan check
-- ============================================================================
CREATE OR REPLACE FUNCTION assign_bar_member(
  p_user_id UUID,
  p_bar_id UUID,
  p_role TEXT,
  p_assigned_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_membership_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id) THEN
    RAISE EXCEPTION '[assign_bar_member] User not found: %', p_user_id;
  END IF;

  IF EXISTS (SELECT 1 FROM bar_members WHERE user_id = p_user_id AND bar_id = p_bar_id) THEN
    RAISE EXCEPTION '[assign_bar_member] User % is already a member of bar %', p_user_id, p_bar_id;
  END IF;

  -- ⭐ PLAN LIMIT CHECK
  IF public.check_plan_member_limit(p_bar_id, p_user_id) THEN
    RAISE EXCEPTION '[assign_bar_member] Limite de membres atteinte pour le plan actuel du bar %', p_bar_id;
  END IF;

  INSERT INTO bar_members (
    user_id, bar_id, role, assigned_by, assigned_at, is_active
  ) VALUES (
    p_user_id, p_bar_id, p_role, p_assigned_by, NOW(), true
  )
  RETURNING id INTO v_membership_id;

  RETURN jsonb_build_object(
    'success', true,
    'membership_id', v_membership_id
  );
END;
$$;
