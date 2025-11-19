-- =====================================================
-- CUSTOM AUTH SYSTEM - COMPLETE MIGRATION V1.0
-- Username + Password avec bcrypt, sans Supabase Auth
-- Date: 19 Janvier 2025
-- =====================================================

-- ARCHITECTURE:
-- - Custom auth basé sur username + password_hash (bcrypt)
-- - Sessions via current_setting('app.user_id')
-- - RLS via get_current_user_id() (nouvelle fonction)
-- - auth_user_id() reste intact pour compatibilité future Supabase Auth

-- =====================================================
-- ÉTAPE 1: SUPPRIMER LES TRIGGERS SUPABASE AUTH
-- =====================================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- =====================================================
-- ÉTAPE 2: RECRÉER LA TABLE USERS
-- =====================================================

DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  first_login BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,

  CONSTRAINT username_length CHECK (char_length(username) >= 3),
  CONSTRAINT username_format CHECK (username ~ '^[a-z0-9_]+$')
);

COMMENT ON TABLE users IS 'Utilisateurs avec auth custom (username + password_hash bcrypt)';
COMMENT ON COLUMN users.username IS 'Identifiant unique (3+ chars, alphanumerique)';
COMMENT ON COLUMN users.password_hash IS 'Hash bcrypt du mot de passe';
COMMENT ON COLUMN users.last_login_at IS 'Dernière connexion réussie';

-- Trigger updated_at
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Index
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_is_active ON users(is_active);
CREATE INDEX idx_users_last_login ON users(last_login_at DESC);

-- =====================================================
-- ÉTAPE 3: FONCTIONS CUSTOM AUTH
-- =====================================================

-- Fonction principale: Récupère l'ID utilisateur de la session
CREATE OR REPLACE FUNCTION get_current_user_id() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::UUID;
$$ LANGUAGE SQL STABLE;

COMMENT ON FUNCTION get_current_user_id() IS 'Retourne l''ID utilisateur depuis current_setting(app.user_id)';

-- Fonction pour définir la session utilisateur (appelée côté client)
CREATE OR REPLACE FUNCTION set_user_session(user_id UUID) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.user_id', user_id::TEXT, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION set_user_session(UUID) IS 'Définit l''ID utilisateur dans la session pour RLS';

-- Valider login et retourner les infos utilisateur
CREATE OR REPLACE FUNCTION validate_password(p_username TEXT, p_password TEXT)
RETURNS TABLE (
  user_id UUID,
  username TEXT,
  name TEXT,
  phone TEXT,
  avatar_url TEXT,
  is_active BOOLEAN,
  first_login BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id,
    u.username,
    u.name,
    u.phone,
    u.avatar_url,
    u.is_active,
    u.first_login
  FROM users u
  WHERE u.username = p_username
    AND u.password_hash = crypt(p_password, u.password_hash)
    AND u.is_active = true;

  -- Mettre à jour last_login_at
  UPDATE users
  SET last_login_at = NOW()
  WHERE username = p_username
    AND password_hash = crypt(p_password, password_hash)
    AND is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION validate_password(TEXT, TEXT) IS 'Valide username/password et retourne les infos user';

-- Créer un utilisateur avec password hashé
CREATE OR REPLACE FUNCTION create_user(
  p_username TEXT,
  p_password TEXT,
  p_name TEXT,
  p_phone TEXT
) RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
BEGIN
  INSERT INTO users (username, password_hash, name, phone)
  VALUES (
    p_username,
    crypt(p_password, gen_salt('bf')),
    p_name,
    p_phone
  )
  RETURNING id INTO v_user_id;

  RETURN v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION create_user(TEXT, TEXT, TEXT, TEXT) IS 'Crée un user avec hash bcrypt auto';

-- Changer le mot de passe
CREATE OR REPLACE FUNCTION change_password(
  p_user_id UUID,
  p_old_password TEXT,
  p_new_password TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_password_valid BOOLEAN;
BEGIN
  -- Vérifier l'ancien mot de passe
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = p_user_id
      AND password_hash = crypt(p_old_password, password_hash)
  ) INTO v_password_valid;

  IF NOT v_password_valid THEN
    RAISE EXCEPTION 'Ancien mot de passe incorrect';
  END IF;

  -- Mettre à jour
  UPDATE users
  SET password_hash = crypt(p_new_password, gen_salt('bf')),
      first_login = false,
      updated_at = NOW()
  WHERE id = p_user_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION change_password(UUID, TEXT, TEXT) IS 'Change le password avec vérification ancien MDP';

-- =====================================================
-- ÉTAPE 4: METTRE À JOUR LES HELPER FUNCTIONS RLS
-- =====================================================

-- Remplacer auth_user_id() par get_current_user_id() dans is_super_admin
CREATE OR REPLACE FUNCTION is_super_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM bar_members
    WHERE user_id = get_current_user_id()
    AND role = 'super_admin'
    AND is_active = true
  );
$$ LANGUAGE SQL STABLE;

-- Remplacer dans is_bar_member
CREATE OR REPLACE FUNCTION is_bar_member(bar_id_param UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM bar_members
    WHERE user_id = get_current_user_id()
    AND bar_id = bar_id_param
    AND is_active = true
  );
$$ LANGUAGE SQL STABLE;

-- Remplacer dans get_user_role
CREATE OR REPLACE FUNCTION get_user_role(bar_id_param UUID) RETURNS TEXT AS $$
  SELECT role FROM bar_members
  WHERE user_id = get_current_user_id()
  AND bar_id = bar_id_param
  AND is_active = true
  LIMIT 1;
$$ LANGUAGE SQL STABLE;

-- Remplacer dans is_promoteur_or_admin
CREATE OR REPLACE FUNCTION is_promoteur_or_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM bar_members
    WHERE user_id = get_current_user_id()
    AND role IN ('super_admin', 'promoteur')
    AND is_active = true
  );
$$ LANGUAGE SQL STABLE;

-- =====================================================
-- ÉTAPE 5: RECRÉER LES POLITIQUES RLS USERS
-- =====================================================

DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Super admins can view all users" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Admins can create users" ON users;
DROP POLICY IF EXISTS "Admins can insert user profiles" ON users;

CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  USING (id = get_current_user_id() OR is_super_admin());

CREATE POLICY "Super admins can view all users"
  ON users FOR SELECT
  USING (is_super_admin());

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (id = get_current_user_id());

CREATE POLICY "Admins can create users"
  ON users FOR INSERT
  WITH CHECK (is_promoteur_or_admin());

-- =====================================================
-- ÉTAPE 6: METTRE À JOUR AUTRES POLITIQUES
-- =====================================================

-- BARS
DROP POLICY IF EXISTS "Bar owners can update bars" ON bars;
CREATE POLICY "Bar owners can update bars"
  ON bars FOR UPDATE
  USING (
    is_super_admin() OR
    owner_id = get_current_user_id() OR
    get_user_role(id) IN ('promoteur', 'gerant')
  );

-- AI CONVERSATIONS
DROP POLICY IF EXISTS "Users can view own AI conversations" ON ai_conversations;
DROP POLICY IF EXISTS "Users can create AI conversations" ON ai_conversations;
DROP POLICY IF EXISTS "Users can update own AI conversations" ON ai_conversations;

CREATE POLICY "Users can view own AI conversations"
  ON ai_conversations FOR SELECT
  USING (
    user_id = get_current_user_id() OR
    (bar_id IS NOT NULL AND is_bar_member(bar_id)) OR
    is_super_admin()
  );

CREATE POLICY "Users can create AI conversations"
  ON ai_conversations FOR INSERT
  WITH CHECK (
    user_id = get_current_user_id() OR
    is_super_admin()
  );

CREATE POLICY "Users can update own AI conversations"
  ON ai_conversations FOR UPDATE
  USING (
    user_id = get_current_user_id() OR
    is_super_admin()
  );

-- =====================================================
-- ÉTAPE 7: ENABLE RLS
-- =====================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- NOTES D'UTILISATION
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ CUSTOM AUTH SYSTEM CRÉÉ !';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '';
  RAISE NOTICE '📋 FONCTIONS DISPONIBLES:';
  RAISE NOTICE '   • create_user(username, password, name, phone)';
  RAISE NOTICE '   • validate_password(username, password)';
  RAISE NOTICE '   • change_password(user_id, old_pwd, new_pwd)';
  RAISE NOTICE '   • get_current_user_id() → UUID from session';
  RAISE NOTICE '';
  RAISE NOTICE '🔐 SÉCURITÉ:';
  RAISE NOTICE '   • Bcrypt pour hash passwords (gen_salt(''bf''))';
  RAISE NOTICE '   • SECURITY DEFINER sur fonctions sensibles';
  RAISE NOTICE '   • RLS actif sur toutes les tables';
  RAISE NOTICE '   • Validation username (3+ chars, [a-z0-9_])';
  RAISE NOTICE '';
  RAISE NOTICE '🎯 WORKFLOW:';
  RAISE NOTICE '   1. Login → validate_password() → récupère user_id';
  RAISE NOTICE '   2. Génère JWT avec user_id';
  RAISE NOTICE '   3. Chaque requête: SET LOCAL app.user_id = ''uuid''';
  RAISE NOTICE '   4. RLS utilise get_current_user_id()';
  RAISE NOTICE '';
  RAISE NOTICE '📝 EXEMPLE CRÉATION SUPER ADMIN:';
  RAISE NOTICE '   SELECT create_user(''admin'', ''Admin@1234'', ''Super Admin'', ''+229...'');';
  RAISE NOTICE '';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
END $$;
