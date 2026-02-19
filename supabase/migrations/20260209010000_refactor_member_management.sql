-- Migration: Refactor Member Management (Centralize Logic)
-- Date: 2026-02-09
-- Description: Adds RPCs for atomic member management with server-side validation and audit logging.

-- 1. Helper RPC: Check Permissions
-- Centralizes logic for "Who can add/remove whom"
CREATE OR REPLACE FUNCTION public.check_user_can_manage_members(
  p_bar_id UUID,
  p_user_id UUID,
  p_action TEXT  -- 'create_manager' | 'create_server' | 'remove_member' | 'update_role'
)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_role TEXT;
  v_is_owner BOOLEAN;
  v_is_super_admin BOOLEAN;
BEGIN
  -- Check Super Admin
  SELECT EXISTS (
    SELECT 1 FROM public.bar_members 
    WHERE user_id = p_user_id AND role = 'super_admin' AND is_active = TRUE
  ) INTO v_is_super_admin;
  
  IF v_is_super_admin THEN 
    RETURN TRUE; 
  END IF;

  -- Check Owner
  SELECT EXISTS (
    SELECT 1 FROM public.bars 
    WHERE id = p_bar_id AND owner_id = p_user_id
  ) INTO v_is_owner;

  IF v_is_owner THEN 
    RETURN TRUE; 
  END IF;

  -- Get Member Role for this bar
  SELECT role INTO v_user_role
  FROM public.bar_members
  WHERE bar_id = p_bar_id AND user_id = p_user_id AND is_active = TRUE;

  -- Logic based on action
    -- Only Owner or Super Admin can create managers (already handled)
    -- We also allow anyone with the 'promoteur' role in bar_members
    RETURN v_user_role = 'promoteur'; 
  ELSIF p_action = 'create_server' THEN
    -- Managers can create servers
    RETURN v_user_role = 'gerant' OR v_user_role = 'promoteur';
  ELSIF p_action = 'remove_member' THEN
    -- Managers can remove servers, but not other managers or owner
    -- Managers and Promoters can remove servers
    IF v_user_role = 'gerant' OR v_user_role = 'promoteur' THEN
        RETURN TRUE; 
    END IF;
    RETURN FALSE;
  ELSE
    RETURN FALSE;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Atomic RPC: Add Bar Member v2
-- Handles: Permission + Collision Check + Insert + Mapping + Audit
CREATE OR REPLACE FUNCTION public.add_bar_member_v2(
  p_bar_id UUID,
  p_user_id UUID,
  p_role TEXT,
  p_assigned_by_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_user_name TEXT;
  v_can_manage BOOLEAN;
  v_member_id UUID;
  v_action TEXT;
BEGIN
  -- 1. Determine action type for permission check
  IF p_role = 'gerant' THEN
    v_action := 'create_manager';
  ELSE
    v_action := 'create_server';
  END IF;

  -- 2. Check Permissions
  v_can_manage := public.check_user_can_manage_members(p_bar_id, p_assigned_by_id, v_action);
  IF NOT v_can_manage THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission refusée pour cette action');
  END IF;

  -- 3. Get User Name (for mapping and collision check)
  SELECT name INTO v_user_name FROM public.users WHERE id = p_user_id;
  IF v_user_name IS NULL THEN
     RETURN jsonb_build_object('success', false, 'error', 'Utilisateur introuvable');
  END IF;

  -- 4. Collision Detection (Server Name Mappings)
  -- Only relevant for 'serveur' role, but good to keep consistency
  IF p_role = 'serveur' THEN
      IF EXISTS (
        SELECT 1 FROM public.server_name_mappings 
        WHERE bar_id = p_bar_id 
          AND server_name = v_user_name 
          AND user_id != p_user_id -- Ignore self if already exists
      ) THEN
        RETURN jsonb_build_object('success', false, 'error', format('Le nom "%s" est déjà utilisé par un autre serveur dans ce bar.', v_user_name));
      END IF;
  END IF;

  -- 5. Insert / Upsert Member
  INSERT INTO public.bar_members (bar_id, user_id, role, assigned_by, is_active, joined_at)
  VALUES (p_bar_id, p_user_id, p_role, p_assigned_by_id, TRUE, NOW())
  ON CONFLICT (bar_id, user_id) WHERE user_id IS NOT NULL
  DO UPDATE SET 
    role = EXCLUDED.role, 
    is_active = TRUE,
    assigned_by = EXCLUDED.assigned_by
  RETURNING id INTO v_member_id;

  -- 6. Auto-create Mapping (if server)
  IF p_role = 'serveur' THEN
    INSERT INTO public.server_name_mappings (bar_id, user_id, server_name, created_at, updated_at)
    VALUES (p_bar_id, p_user_id, v_user_name, NOW(), NOW())
    ON CONFLICT (bar_id, server_name) DO NOTHING; -- ✅ Safety: Prevent duplicate mapping error if already exists
  END IF;

  -- 7. Audit Log (Using shared internal helper)
  PERFORM public.internal_log_audit_event(
    'MEMBER_ADDED',
    'info',
    p_assigned_by_id,
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

-- 3. Atomic RPC: Remove Bar Member
CREATE OR REPLACE FUNCTION public.remove_bar_member_v2(
  p_bar_id UUID,
  p_user_id_to_remove UUID,
  p_removed_by_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_target_role TEXT;
  v_can_manage BOOLEAN;
  v_can_remove_target BOOLEAN;
  v_user_name TEXT;
BEGIN
    -- Get target info
    SELECT role, u.name INTO v_target_role, v_user_name
    FROM public.bar_members bm
    JOIN public.users u ON u.id = bm.user_id
    WHERE bm.bar_id = p_bar_id AND bm.user_id = p_user_id_to_remove;

    IF v_target_role IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Membre introuvable');
    END IF;

    -- Basic permission check
    v_can_manage := public.check_user_can_manage_members(p_bar_id, p_removed_by_id, 'remove_member');
    
    -- Specific check: Managers cannot remove other Managers
    IF v_target_role = 'gerant' THEN
         -- Re-verify if p_removed_by_id is Owner or Super Admin
         IF NOT EXISTS (SELECT 1 FROM public.bars WHERE id = p_bar_id AND owner_id = p_removed_by_id) 
            AND NOT EXISTS (
                SELECT 1 FROM public.bar_members 
                WHERE user_id = p_removed_by_id AND role = 'super_admin' AND is_active = TRUE
            ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Seul le propriétaire ou un Super Admin peut retirer un gérant.');
         END IF;
         -- If we reached here, it means p_removed_by_id is either owner or super_admin, so they can remove a manager.
         v_can_remove_target := TRUE;
    ELSE
         -- Target is server, safe if general permission is true
         v_can_remove_target := v_can_manage;
    END IF;

    IF NOT v_can_remove_target THEN
        RETURN jsonb_build_object('success', false, 'error', 'Permission refusée: Vous ne pouvez pas supprimer ce membre');
    END IF;

    -- Soft Delete
    UPDATE public.bar_members
    SET is_active = FALSE
    WHERE bar_id = p_bar_id AND user_id = p_user_id_to_remove;

    -- Audit
    PERFORM public.internal_log_audit_event(
        'MEMBER_REMOVED',
        'warning',
        p_removed_by_id,
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

-- 4. Grant Permissions
GRANT EXECUTE ON FUNCTION public.check_user_can_manage_members TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_bar_member_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_bar_member_v2 TO authenticated;
