-- Fix setup_promoter_bar RPC: column name bug in bar_members INSERT
-- Issue: RPC was trying to insert into non-existent column 'v_bar_id' (variable name instead of column name)
-- Solution: Use correct column name 'bar_id' in the INSERT statement
-- This fix allows admin to create bars for existing promoters

-- Drop existing function
DROP FUNCTION IF EXISTS public.setup_promoter_bar(uuid, text, jsonb);

-- Recreate with corrected column names
CREATE OR REPLACE FUNCTION public.setup_promoter_bar(
  p_owner_id UUID,
  p_bar_name TEXT,
  p_settings JSONB DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  current_user_id UUID := auth.uid();
  is_super_admin BOOLEAN := FALSE;
  v_bar_id UUID;
  v_default_settings JSONB;
  v_categories_count INTEGER;
BEGIN
  -- Vérification de sécurité: Seuls les super admins peuvent exécuter cette fonction.
  SELECT EXISTS (
    SELECT 1 FROM public.bar_members
    WHERE user_id = current_user_id AND role = 'super_admin' AND is_active = TRUE
  ) INTO is_super_admin;

  IF NOT is_super_admin THEN
    RAISE EXCEPTION 'Permission denied: only super admins can execute setup_promoter_bar.';
  END IF;

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

  -- 1. Create Bar with address and phone extracted from settings
  RAISE NOTICE '[setup_promoter_bar] Creating bar...';
  INSERT INTO bars (
    name,
    owner_id,
    address,
    phone,
    settings,
    is_active
  ) VALUES (
    p_bar_name,
    p_owner_id,
    COALESCE((p_settings->>'address')::TEXT, NULL),  -- Extract from settings if provided
    COALESCE((p_settings->>'phone')::TEXT, NULL),    -- Extract from settings if provided
    v_default_settings,
    true
  )
  RETURNING id INTO v_bar_id;
  RAISE NOTICE '[setup_promoter_bar] ✓ Bar created: id=%, name=%, address=%, phone=%',
    v_bar_id, p_bar_name, COALESCE((p_settings->>'address')::TEXT, 'NULL'), COALESCE((p_settings->>'phone')::TEXT, 'NULL');

  -- 2. Assign Owner as Promoter
  RAISE NOTICE '[setup_promoter_bar] Assigning owner as promoter...';
  INSERT INTO bar_members (
    user_id,
    bar_id,  -- FIX: Changed from 'v_bar_id' (variable) to 'bar_id' (column)
    role,
    assigned_by,
    joined_at,
    is_active
  ) VALUES (
    p_owner_id,
    v_bar_id,  -- This is the variable with the bar's ID
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
    'bar_name', p_bar_name,
    'bar_address', COALESCE((p_settings->>'address')::TEXT, NULL),
    'bar_phone', COALESCE((p_settings->>'phone')::TEXT, NULL)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.setup_promoter_bar(uuid, text, jsonb) TO authenticated;
