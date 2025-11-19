-- =====================================================
-- MIGRATION 006: Add login_user function
-- Date: 19 Novembre 2025
-- =====================================================

-- Fonction pour gérer le login complet en une seule transaction
-- Bypass RLS avec SECURITY DEFINER
CREATE OR REPLACE FUNCTION login_user(p_username TEXT, p_password TEXT)
RETURNS TABLE (
  user_id UUID,
  username TEXT,
  name TEXT,
  phone TEXT,
  avatar_url TEXT,
  is_active BOOLEAN,
  first_login BOOLEAN,
  role TEXT,
  bar_id UUID,
  bar_name TEXT
) AS $$
DECLARE
  v_user_id UUID;
  v_username TEXT;
  v_name TEXT;
  v_phone TEXT;
  v_avatar_url TEXT;
  v_is_active BOOLEAN;
  v_first_login BOOLEAN;
  v_role TEXT;
  v_bar_id UUID;
  v_bar_name TEXT;
BEGIN
  -- 1. Valider le mot de passe
  SELECT
    u.id,
    u.username,
    u.name,
    u.phone,
    u.avatar_url,
    u.is_active,
    u.first_login
  INTO
    v_user_id,
    v_username,
    v_name,
    v_phone,
    v_avatar_url,
    v_is_active,
    v_first_login
  FROM users u
  WHERE u.username = p_username
    AND u.password_hash = crypt(p_password, u.password_hash)
    AND u.is_active = true;

  -- Si pas de user trouvé
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Nom d''utilisateur ou mot de passe incorrect';
  END IF;

  -- 2. Récupérer le membership (bypass RLS car SECURITY DEFINER)
  SELECT
    bm.role,
    bm.bar_id,
    b.name
  INTO
    v_role,
    v_bar_id,
    v_bar_name
  FROM bar_members bm
  INNER JOIN bars b ON b.id = bm.bar_id
  WHERE bm.user_id = v_user_id
    AND bm.is_active = true
  LIMIT 1;

  -- Si pas de membership trouvé
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non assigné à un bar';
  END IF;

  -- 3. Mettre à jour last_login_at
  UPDATE users
  SET last_login_at = NOW()
  WHERE id = v_user_id;

  -- 4. Définir la session pour les futures requêtes
  PERFORM set_config('app.user_id', v_user_id::TEXT, false);

  -- 5. Retourner toutes les infos
  RETURN QUERY SELECT
    v_user_id,
    v_username,
    v_name,
    v_phone,
    v_avatar_url,
    v_is_active,
    v_first_login,
    v_role,
    v_bar_id,
    v_bar_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION login_user(TEXT, TEXT) IS
  'Authentifie un utilisateur et retourne ses infos + membership (bypass RLS)';
