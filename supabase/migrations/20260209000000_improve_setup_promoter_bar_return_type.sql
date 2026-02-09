-- EXPERT FIX: Improve setup_promoter_bar to return complete bar record
-- Issue: Frontend needs to fetch bar again after RPC, creating 2nd request
-- Solution: Return full bar record from RPC to eliminate need for second fetch
-- This ensures atomicity: creation + full data retrieval in one operation

DROP FUNCTION IF EXISTS public.setup_promoter_bar(uuid, text, text, text, jsonb);

-- Recreate with improved return type (full bar record in JSON)
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
  v_bar_record RECORD;
BEGIN
  -- ✅ Security: Only super admins can execute this function
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
    is_active,
    closing_hour
  ) VALUES (
    p_bar_name,
    p_owner_id,
    p_address,           -- Direct column
    p_phone,             -- Direct column
    v_default_settings,
    true,
    6                    -- Default business day close hour
  )
  RETURNING * INTO v_bar_record;

  v_bar_id := v_bar_record.id;
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

  -- ✅ EXPERT FIX: Return full bar record as JSON to eliminate 2nd fetch
  -- This ensures the bar creation and retrieval is atomic (one RPC call)
  RETURN jsonb_build_object(
    'success', true,
    'bar_id', v_bar_record.id,
    'bar_name', v_bar_record.name,
    'bar_address', v_bar_record.address,
    'bar_phone', v_bar_record.phone,
    -- Complete bar record for direct mapping
    'id', v_bar_record.id,
    'name', v_bar_record.name,
    'owner_id', v_bar_record.owner_id,
    'address', v_bar_record.address,
    'phone', v_bar_record.phone,
    'logo_url', v_bar_record.logo_url,
    'settings', v_bar_record.settings,
    'is_active', v_bar_record.is_active,
    'closing_hour', v_bar_record.closing_hour,
    'created_at', v_bar_record.created_at,
    'updated_at', v_bar_record.updated_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.setup_promoter_bar(uuid, text, text, text, jsonb) TO authenticated;

-- Update comment
COMMENT ON FUNCTION public.setup_promoter_bar(uuid, text, text, text, jsonb) IS
  'Create a new bar for an existing promoter (super_admin only).
   Returns complete bar record to avoid second fetch.
   Parameters: owner_id (uuid), bar_name (text), address (text, optional), phone (text, optional), settings (jsonb, optional)';
