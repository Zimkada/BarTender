-- =====================================================
-- MIGRATION 036: Fix Auth Schema & Add Atomic RPCs
-- Date: 25 Novembre 2025
-- Description: 
-- 1. Rename assigned_at -> joined_at (consistency)
-- 2. Make assigned_by nullable (for promoters/self-registration)
-- 3. Add RPCs for atomic operations
-- =====================================================

-- 1. Schema Updates
-- =====================================================

DO $$
DECLARE
  v_row_count INTEGER;
BEGIN
  -- Check if we have existing data
  SELECT COUNT(*) INTO v_row_count FROM bar_members;
  RAISE NOTICE 'Migration 036: Found % existing bar_members records', v_row_count;

  -- Rename assigned_at to joined_at if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bar_members' AND column_name = 'assigned_at'
  ) THEN
    RAISE NOTICE 'Migration 036: Renaming assigned_at to joined_at...';
    ALTER TABLE bar_members RENAME COLUMN assigned_at TO joined_at;
    RAISE NOTICE 'Migration 036: ✓ Column renamed successfully';
  ELSE
    RAISE NOTICE 'Migration 036: Column assigned_at does not exist, skipping rename';
  END IF;

  -- Make assigned_by nullable
  RAISE NOTICE 'Migration 036: Making assigned_by nullable...';
  ALTER TABLE bar_members ALTER COLUMN assigned_by DROP NOT NULL;
  RAISE NOTICE 'Migration 036: ✓ assigned_by is now nullable';

  -- Verify data integrity
  SELECT COUNT(*) INTO v_row_count FROM bar_members;
  RAISE NOTICE 'Migration 036: Verified % bar_members records after migration', v_row_count;

END $$;

-- 2. RPC: Assign Member (Atomic)
-- =====================================================
-- Used by Managers to add Servers/Managers
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

  -- Insert membership
  INSERT INTO bar_members (
    user_id,
    bar_id,
    role,
    assigned_by,
    joined_at,
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

-- 3. RPC: Setup Promoter Bar (Atomic)
-- =====================================================
-- Used by Super Admin to create Promoter + Bar
CREATE OR REPLACE FUNCTION setup_promoter_bar(
  p_owner_id UUID,
  p_bar_name TEXT,
  p_settings JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bar_id UUID;
  v_default_settings JSONB;
  v_categories_count INTEGER;
BEGIN
  -- Log start
  RAISE NOTICE '[setup_promoter_bar] Starting setup: owner=%, bar_name=%', p_owner_id, p_bar_name;

  -- Default settings if not provided
  v_default_settings := '{
    "currency": "XOF",
    "currencySymbol": "FCFA",
    "timezone": "Africa/Porto-Novo",
    "language": "fr",
    "businessDayCloseHour": 6,
    "operatingMode": "full",
    "consignmentExpirationDays": 7
  }'::jsonb;

  IF p_settings IS NOT NULL THEN
    v_default_settings := v_default_settings || p_settings;
  END IF;

  -- 1. Create Bar
  RAISE NOTICE '[setup_promoter_bar] Creating bar...';
  INSERT INTO bars (
    name,
    owner_id,
    settings,
    is_active
  ) VALUES (
    p_bar_name,
    p_owner_id,
    v_default_settings,
    true
  )
  RETURNING id INTO v_bar_id;
  RAISE NOTICE '[setup_promoter_bar] ✓ Bar created: %', v_bar_id;

  -- 2. Assign Owner as Promoter
  RAISE NOTICE '[setup_promoter_bar] Assigning owner as promoter...';
  INSERT INTO bar_members (
    user_id,
    bar_id,
    role,
    assigned_by, -- Nullable now, or self-assigned
    joined_at,
    is_active
  ) VALUES (
    p_owner_id,
    v_bar_id,
    'promoteur',
    p_owner_id, -- Self-assigned as they are the owner
    NOW(),
    true
  );
  RAISE NOTICE '[setup_promoter_bar] ✓ Promoter assigned';

  -- 3. Initialize Default Categories (Optional but recommended)
  RAISE NOTICE '[setup_promoter_bar] Initializing default categories...';
  INSERT INTO bar_categories (bar_id, global_category_id, is_active)
  SELECT v_bar_id, id, true
  FROM global_categories
  WHERE is_system = true;
  
  GET DIAGNOSTICS v_categories_count = ROW_COUNT;
  RAISE NOTICE '[setup_promoter_bar] ✓ Initialized % categories', v_categories_count;

  RETURN jsonb_build_object(
    'success', true,
    'bar_id', v_bar_id,
    'bar_name', p_bar_name
  );
END;
$$;

-- 4. RPC: Complete First Login
-- =====================================================
-- Used when user changes password for the first time
CREATE OR REPLACE FUNCTION complete_first_login(
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE users
  SET 
    first_login = false,
    updated_at = NOW()
  WHERE id = p_user_id;

  RETURN FOUND;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION assign_bar_member TO authenticated;
GRANT EXECUTE ON FUNCTION setup_promoter_bar TO authenticated;
GRANT EXECUTE ON FUNCTION complete_first_login TO authenticated;

-- Notify schema reload
NOTIFY pgrst, 'reload schema';
