-- Migration: Fix check_user_can_manage_members Syntax Error
-- Date: 2026-02-20
-- Description: Fixes missing IF statement for 'create_manager' action in check_user_can_manage_members function.
-- The original migration (20260209010000) had an ELSIF without a preceding IF, which causes a PostgreSQL syntax error.

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
  IF p_action = 'create_manager' THEN
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
