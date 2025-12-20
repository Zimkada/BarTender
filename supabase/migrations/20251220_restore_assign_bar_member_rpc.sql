-- =====================================================
-- RESTORE: assign_bar_member RPC Function
-- Date: December 20, 2025
-- Description: Restore the assign_bar_member RPC that was
-- accidentally dropped in migration 1036_rollback.sql
-- This RPC is used by the Edge Function create-bar-member
-- to atomically assign users to bars
-- =====================================================

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
  -- Log start
  RAISE NOTICE '[assign_bar_member] Starting assignment: user=%, bar=%, role=%', p_user_id, p_bar_id, p_role;

  -- Check if user exists in public.users
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id) THEN
    RAISE EXCEPTION '[assign_bar_member] User not found: %', p_user_id;
  END IF;

  -- Check if already member
  IF EXISTS (SELECT 1 FROM bar_members WHERE user_id = p_user_id AND bar_id = p_bar_id) THEN
    RAISE EXCEPTION '[assign_bar_member] User % is already a member of bar %', p_user_id, p_bar_id;
  END IF;

  -- Insert membership (use assigned_at column)
  INSERT INTO bar_members (
    user_id,
    bar_id,
    role,
    assigned_by,
    assigned_at,
    is_active
  ) VALUES (
    p_user_id,
    p_bar_id,
    p_role,
    p_assigned_by,
    NOW(),
    true
  )
  RETURNING id INTO v_membership_id;

  RAISE NOTICE '[assign_bar_member] ✓ Successfully created membership: %', v_membership_id;

  RETURN jsonb_build_object(
    'success', true,
    'membership_id', v_membership_id
  );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION assign_bar_member(UUID, UUID, TEXT, UUID) TO authenticated;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

-- =====================================================
-- Verification
-- =====================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Migration 20251220: assign_bar_member RPC restored successfully';
END $$;
