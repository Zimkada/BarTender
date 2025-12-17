-- Refactor setup_promoter_bar RPC to accept address and phone as separate parameters
-- Issue: Previously address and phone were inside p_settings JSONB, not inserted into columns
-- Solution: Accept address and phone as direct parameters for robustness and performance
-- This is a breaking change but setup_promoter_bar is internal RPC, not public API

-- Drop existing function (signature changed)
DROP FUNCTION IF EXISTS public.setup_promoter_bar(uuid, text, jsonb);

-- Recreate with separate address and phone parameters
CREATE OR REPLACE FUNCTION public.setup_promoter_bar(
  p_owner_id UUID,
  p_bar_name TEXT,
  p_address TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
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

  -- Log start with all parameters
  RAISE NOTICE '[setup_promoter_bar] Starting setup: owner=%, bar_name=%, address=%, phone=%',
    p_owner_id, p_bar_name, p_address, p_phone;

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

  -- Merge with provided settings if any
  IF p_settings IS NOT NULL THEN
    v_default_settings := v_default_settings || p_settings;
  END IF;

  -- 1. Create Bar with address and phone as direct columns
  RAISE NOTICE '[setup_promoter_bar] Creating bar with address and phone...';
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
    p_address,           -- Direct column (not from JSONB)
    p_phone,             -- Direct column (not from JSONB)
    v_default_settings,
    true
  )
  RETURNING id INTO v_bar_id;
  RAISE NOTICE '[setup_promoter_bar] ✓ Bar created: id=%, name=%, address=%, phone=%',
    v_bar_id, p_bar_name, p_address, p_phone;

  -- 2. Assign Owner as Promoter
  RAISE NOTICE '[setup_promoter_bar] Assigning owner as promoter...';
  INSERT INTO bar_members (
    user_id,
    bar_id,
    role,
    assigned_by,
    joined_at,
    is_active
  ) VALUES (
    p_owner_id,
    v_bar_id,
    'promoteur',
    p_owner_id,
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

  -- Return success with full bar details
  RETURN jsonb_build_object(
    'success', true,
    'bar_id', v_bar_id,
    'bar_name', p_bar_name,
    'bar_address', p_address,
    'bar_phone', p_phone
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.setup_promoter_bar(uuid, text, text, text, jsonb) TO authenticated;

-- Add comment documenting the function
COMMENT ON FUNCTION public.setup_promoter_bar(uuid, text, text, text, jsonb) IS
  'Create a new bar for an existing promoter (super_admin only). '
  'Parameters: owner_id, bar_name, address (optional), phone (optional), settings (optional JSONB)';
