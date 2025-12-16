-- Migration: Correction des failles de sécurité dans la gestion des utilisateurs.
-- Date: 2025-12-15 18:00:00
-- Description: Ajout de contrôles de rôle 'super_admin' aux fonctions RPC sensibles
--              get_paginated_users et setup_promoter_bar.

-- ========================================================================
-- Correction de la fonction get_paginated_users
-- ========================================================================

DROP FUNCTION IF EXISTS get_paginated_users(INT, INT, TEXT, TEXT) CASCADE;

CREATE OR REPLACE FUNCTION get_paginated_users(
    p_page INT,
    p_limit INT,
    p_search_query TEXT DEFAULT '',
    p_role_filter TEXT DEFAULT 'all'
)
RETURNS TABLE (users JSONB, total_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  is_super_admin BOOLEAN := FALSE;
BEGIN
  -- Vérification de sécurité: Seuls les super admins peuvent exécuter cette fonction.
  SELECT EXISTS (
    SELECT 1 FROM public.bar_members
    WHERE user_id = current_user_id AND role = 'super_admin' AND is_active = TRUE
  ) INTO is_super_admin;

  IF NOT is_super_admin THEN
    RAISE EXCEPTION 'Permission denied: only super admins can execute get_paginated_users.';
  END IF;

    RETURN QUERY
    WITH user_roles_and_bars AS (
        SELECT
            u.id,
            u.username,
            u.name,
            u.phone,
            u.email,
            u.created_at,
            u.is_active,
            u.first_login,
            u.last_login_at,
            COALESCE(
                jsonb_agg(DISTINCT bm.role) FILTER (WHERE bm.role IS NOT NULL AND bm.is_active = true),
                '[]'::jsonb
            ) AS roles,
            COALESCE(
                jsonb_agg(DISTINCT jsonb_build_object('id', b.id, 'name', b.name))
                FILTER (WHERE b.id IS NOT NULL AND bm.is_active = true),
                '[]'::jsonb
            ) AS bars
        FROM users u
        LEFT JOIN bar_members bm ON bm.user_id = u.id
        LEFT JOIN bars b ON bm.bar_id = b.id
        WHERE
            (p_search_query = '' OR
             u.username ILIKE '%' || p_search_query || '%' OR
             u.name ILIKE '%' || p_search_query || '%' OR
             u.email ILIKE '%' || p_search_query || '%')
        GROUP BY u.id
    ),
    filtered_users AS (
        SELECT *
        FROM user_roles_and_bars
        WHERE
            (p_role_filter = 'all' OR roles ? p_role_filter)
    )
    SELECT
        (
            SELECT jsonb_agg(f)
            FROM (
                SELECT *
                FROM filtered_users
                ORDER BY created_at DESC
                LIMIT p_limit
                OFFSET (p_page - 1) * p_limit
            ) f
        ) AS users,
        (SELECT COUNT(*) FROM filtered_users) AS total_count;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_paginated_users(INT, INT, TEXT, TEXT) TO authenticated;

-- Add a comment to explain the function
COMMENT ON FUNCTION get_paginated_users(INT, INT, TEXT, TEXT) IS
'Get a paginated list of users with their roles and bar associations.
**SECURITY**: Only super admins can execute this function.
Supports search by username/name/email and filtering by role.';

-- ========================================================================
-- Correction de la fonction setup_promoter_bar
-- ========================================================================

DROP FUNCTION IF EXISTS setup_promoter_bar(UUID, TEXT, JSONB) CASCADE;

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
    v_bar_id,
    role,
    assigned_by,
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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION setup_promoter_bar(UUID, TEXT, JSONB) TO authenticated;

-- ========================================================================
-- Notifier Supabase de recharger le schéma pour PostgREST
-- ========================================================================
NOTIFY pgrst, 'reload schema';
