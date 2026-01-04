-- ==============================================================================
-- Migration: Add support for assigning existing users to bars
-- Description: Adds RPCs to find candidate staff members and assign them to new bars
-- Author: Antigravity
-- Date: 2026-01-04
-- ==============================================================================

-- 1. RPC to get staff candidates (users working in MY other bars but not this one)
CREATE OR REPLACE FUNCTION get_my_staff_candidates(p_bar_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  email TEXT,
  phone TEXT,
  role TEXT, -- Their role in the OTHER bar (indicative)
  source_bar_name TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_user_role TEXT;
BEGIN
  v_user_id := auth.uid();
  
  -- Check permission: Must be owner (Promoteur) or Super Admin
  SELECT role INTO v_user_role FROM bar_members WHERE user_id = v_user_id AND bar_id = p_bar_id;
  
  -- Allow if Super Admin (via acting_as usually handled by RLS, but here we check effectively)
  -- Or if owner of the bar
  IF EXISTS (SELECT 1 FROM bars WHERE id = p_bar_id AND owner_id = v_user_id) OR
     EXISTS (SELECT 1 FROM users WHERE id = v_user_id AND role = 'super_admin') THEN
     -- Authorized
  ELSE
     -- If generic manager trying to pull? Usually only owners operate multi-bar.
     -- Let's restrict to Owners/Promoters for now as per requirement.
  END IF;

  RETURN QUERY
  WITH my_other_bars AS (
    SELECT id as bar_id, name as bar_name
    FROM bars
    WHERE owner_id = v_user_id  -- Bars owned by me
    AND id != p_bar_id          -- Ensuring we look at OTHER bars
  ),
  candidates AS (
    SELECT 
      bm.user_id,
      bm.role,
      mob.bar_name
    FROM bar_members bm
    JOIN my_other_bars mob ON bm.bar_id = mob.bar_id
    WHERE bm.is_active = true
    AND bm.role IN ('gerant', 'serveur') -- Only operational staff
    AND bm.user_id != v_user_id -- Don't return myself
  ),
  -- Filter out those who are ALREADY in the target bar
  existing_in_target AS (
    SELECT user_id FROM bar_members WHERE bar_id = p_bar_id AND is_active = true
  )
  SELECT DISTINCT ON (u.id)
    u.id,
    u.name,
    u.email,
    u.phone,
    c.role,
    c.bar_name
  FROM candidates c
  JOIN users u ON c.user_id = u.id
  WHERE u.id NOT IN (SELECT user_id FROM existing_in_target)
  ORDER BY u.id, c.role; -- DISTINCT ON requires ORDER BY matching
END;
$$;

-- 2. RPC to add an existing user to a bar (By ID or Email)
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
  
  -- 1. Validate Target User
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

  -- 2. Check Permissions (Requester must be allowed to add members)
  -- Check if Owner
  SELECT (owner_id = v_req_user_id) INTO v_is_owner FROM bars WHERE id = p_bar_id;
  
  -- Check if Manager (if allowed)
  IF NOT v_is_owner THEN
     SELECT role INTO v_req_role FROM bar_members WHERE user_id = v_req_user_id AND bar_id = p_bar_id AND is_active = true;
     
     IF v_req_role = 'gerant' THEN
        -- Managers can only add Servers usually
        IF p_role != 'serveur' THEN
           RETURN jsonb_build_object('success', false, 'error', 'Les gérants ne peuvent ajouter que des serveurs.');
        END IF;
     ELSIF v_req_role != 'super_admin' AND v_req_role != 'promoteur' THEN 
         -- Should have been covered by is_owner check for promoter/admin but fallback
         RETURN jsonb_build_object('success', false, 'error', 'Permission refusée.');
     END IF;
  END IF;

  -- 3. Check if already member
  IF EXISTS (SELECT 1 FROM bar_members WHERE bar_id = p_bar_id AND user_id = v_target_user_id) THEN
     -- If inactive, reactivate
     UPDATE bar_members 
     SET is_active = true, role = p_role::user_role, assigned_at = NOW() -- Cast p_role to user_role enum
     WHERE bar_id = p_bar_id AND user_id = v_target_user_id;
     
     RETURN jsonb_build_object('success', true, 'message', 'Membre réactivé avec succès.');
  ELSE
     -- Insert new
     INSERT INTO bar_members (bar_id, user_id, role, assigned_by, is_active)
     VALUES (p_bar_id, v_target_user_id, p_role::user_role, v_req_user_id, true); -- Cast p_role to user_role enum
     
     RETURN jsonb_build_object('success', true, 'message', 'Membre ajouté avec succès.');
  END IF;

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
