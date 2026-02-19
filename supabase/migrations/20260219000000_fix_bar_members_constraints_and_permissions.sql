-- Migration: Fix ON CONFLICT constraints + check_user_can_manage_members syntax
-- Date: 2026-02-19
-- Fixes:
--   1a. bar_members: partial unique index (redondant mais safe avec IF NOT EXISTS)
--   1b. server_name_mappings: unique index sur (bar_id, server_name)
--   1c. bar_device_status: unique constraint sur (bar_id, device_id)
--       → CREATE TABLE IF NOT EXISTS ignore la table existante, donc n'ajoute
--         jamais la contrainte UNIQUE inline si la table existait déjà avant.
--   2.  check_user_can_manage_members: IF manquant pour create_manager (syntax bug).

-- =====================================================================
-- FIX 1a: Create the missing partial unique index on bar_members (if not exists)
-- Required by: add_bar_member_v2 → ON CONFLICT (bar_id, user_id) WHERE user_id IS NOT NULL
-- NOTE: idx_unique_bar_member_user already covers this — kept for safety
-- =====================================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_bar_members_bar_user_unique
  ON public.bar_members(bar_id, user_id)
  WHERE user_id IS NOT NULL;

-- =====================================================================
-- FIX 1b: Create the missing unique index on server_name_mappings
-- Required by: add_bar_member_v2 step 6 → ON CONFLICT (bar_id, server_name) DO NOTHING
-- Without this, role change TO 'serveur' fails with ON CONFLICT error
-- =====================================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_server_name_mappings_bar_name_unique
  ON public.server_name_mappings(bar_id, server_name);

-- =====================================================================
-- FIX 2: Rewrite check_user_can_manage_members (was missing IF for create_manager)
-- =====================================================================
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
  -- Check Super Admin (cross-bar)
  SELECT EXISTS (
    SELECT 1 FROM public.bar_members
    WHERE user_id = p_user_id AND role = 'super_admin' AND is_active = TRUE
  ) INTO v_is_super_admin;

  IF v_is_super_admin THEN
    RETURN TRUE;
  END IF;

  -- Check Owner of this bar
  SELECT EXISTS (
    SELECT 1 FROM public.bars
    WHERE id = p_bar_id AND owner_id = p_user_id
  ) INTO v_is_owner;

  IF v_is_owner THEN
    RETURN TRUE;
  END IF;

  -- Get member role for this bar
  SELECT role INTO v_user_role
  FROM public.bar_members
  WHERE bar_id = p_bar_id AND user_id = p_user_id AND is_active = TRUE;

  -- Logic based on action
  IF p_action = 'create_manager' THEN
    -- Only Owner / Super Admin (handled above) or promoteur can create managers
    RETURN v_user_role = 'promoteur';

  ELSIF p_action = 'create_server' OR p_action = 'update_role' THEN
    -- Managers and promoteurs can create/update servers
    RETURN v_user_role = 'gerant' OR v_user_role = 'promoteur';

  ELSIF p_action = 'remove_member' THEN
    -- Managers and promoteurs can remove members (further restriction handled in remove_bar_member_v2)
    RETURN v_user_role = 'gerant' OR v_user_role = 'promoteur';

  ELSE
    RETURN FALSE;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.check_user_can_manage_members TO authenticated;

-- =====================================================================
-- FIX 1c: Unique constraint sur bar_device_status(bar_id, device_id)
-- Required by: log_heartbeat → ON CONFLICT (bar_id, device_id)
-- Root cause: CREATE TABLE IF NOT EXISTS saute la définition entière si la
--   table existait déjà → la contrainte UNIQUE inline n'a jamais été ajoutée.
--   Le heartbeat (RootLayout, setInterval) déclenche cette erreur à chaque page.
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'bar_device_status'
      AND indexdef ILIKE '%unique%bar_id%device_id%'
  ) THEN
    ALTER TABLE public.bar_device_status
      ADD CONSTRAINT bar_device_status_bar_id_device_id_key
      UNIQUE (bar_id, device_id);
  END IF;
END $$;
