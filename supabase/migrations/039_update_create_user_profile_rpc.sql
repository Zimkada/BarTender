-- =====================================================
-- Update create_user_profile RPC to Return Profile
-- Date: 25 Novembre 2025
-- Description: Modifie le RPC pour retourner le profil créé
--              au lieu de juste success/error
-- =====================================================

-- Supprimer l'ancienne fonction (nécessaire pour changer le type de retour)
DROP FUNCTION IF EXISTS create_user_profile(UUID, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION create_user_profile(
  p_user_id UUID,
  p_email TEXT,
  p_username TEXT,
  p_name TEXT,
  p_phone TEXT
)
RETURNS TABLE (
  user_id UUID,
  user_email TEXT,
  user_username TEXT,
  user_name TEXT,
  user_phone TEXT,
  user_avatar_url TEXT,
  user_is_active BOOLEAN,
  user_first_login BOOLEAN,
  user_created_at TIMESTAMPTZ,
  user_updated_at TIMESTAMPTZ,
  user_last_login_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Log
  RAISE NOTICE '[create_user_profile] Creating profile for user: %', p_user_id;

  -- Étape 1: Insérer ou mettre à jour le profil
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

  -- Étape 2: Retourner le profil créé
  RETURN QUERY
  SELECT 
    u.id,
    u.email,
    u.username,
    u.name,
    u.phone,
    u.avatar_url,
    u.is_active,
    u.first_login,
    u.created_at,
    u.updated_at,
    u.last_login_at
  FROM public.users u
  WHERE u.id = p_user_id;

  RAISE NOTICE '[create_user_profile] ✓ Profile created and returned';
END;
$$;

-- Permissions
GRANT EXECUTE ON FUNCTION create_user_profile TO authenticated;

-- Notifier
NOTIFY pgrst, 'reload schema';

RAISE NOTICE '✅ RPC create_user_profile updated to return profile';
