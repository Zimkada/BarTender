-- =====================================================
-- RPC: Create User Profile (Bypass RLS)
-- Date: 25 Novembre 2025
-- Description: Crée un profil utilisateur dans public.users
--              en bypassant les RLS (SECURITY DEFINER)
-- =====================================================

CREATE OR REPLACE FUNCTION create_user_profile(
  p_user_id UUID,
  p_email TEXT,
  p_username TEXT,
  p_name TEXT,
  p_phone TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Log
  RAISE NOTICE '[create_user_profile] Creating profile for user: %', p_user_id;

  -- Insérer ou mettre à jour le profil
  INSERT INTO public.users (
    id,
    email,
    username,
    name,
    phone,
    is_active,
    first_login
  ) VALUES (
    p_user_id,
    p_email,
    p_username,
    p_name,
    p_phone,
    true,
    true
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    username = EXCLUDED.username,
    name = EXCLUDED.name,
    phone = EXCLUDED.phone;

  RAISE NOTICE '[create_user_profile] ✓ Profile created successfully';

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[create_user_profile] Error: %', SQLERRM;
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- Permissions
GRANT EXECUTE ON FUNCTION create_user_profile TO authenticated;

-- Notifier
NOTIFY pgrst, 'reload schema';

RAISE NOTICE '✅ RPC create_user_profile created';
