-- =====================================================
-- BARTENDER - COMPLETE DATABASE SETUP
-- Reset + All Migrations (001 + 002 + 004)
-- Date: 19 Novembre 2025
-- =====================================================

-- =====================================================
-- ÉTAPE 0: RESET COMPLET
-- =====================================================

-- Supprimer tout le schéma public
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;

-- Activer les extensions nécessaires
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- MIGRATION 001: SCHEMA INITIAL
-- =====================================================

-- Fonction helper pour updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Table: users (structure temporaire, sera remplacée par migration 004)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: bars
CREATE TABLE bars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID REFERENCES users(id),
  address TEXT,
  phone TEXT,
  logo_url TEXT,
  settings JSONB DEFAULT '{"currency": "FCFA", "currencySymbol": " FCFA", "timezone": "Africa/Porto-Novo", "language": "fr"}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER bars_updated_at BEFORE UPDATE ON bars
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Table: bar_members
CREATE TABLE bar_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bar_id UUID NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'promoteur', 'gerant', 'serveur')),
  assigned_by UUID REFERENCES users(id),
  is_active BOOLEAN DEFAULT true,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, bar_id)
);

CREATE TRIGGER bar_members_updated_at BEFORE UPDATE ON bar_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Table: global_categories
CREATE TABLE global_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#F59E0B',
  icon TEXT,
  order_index INTEGER DEFAULT 0,
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: global_products
CREATE TABLE global_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  brand TEXT,
  volume TEXT NOT NULL,
  volume_ml INTEGER,
  category TEXT NOT NULL,
  official_image TEXT,
  barcode TEXT UNIQUE,
  suggested_price_min DECIMAL(10,2),
  suggested_price_max DECIMAL(10,2),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: bar_categories
CREATE TABLE bar_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bar_id UUID NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#F59E0B',
  icon TEXT,
  order_index INTEGER DEFAULT 0,
  is_custom BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(bar_id, name)
);

-- Table: bar_products
CREATE TABLE bar_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bar_id UUID NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  global_product_id UUID REFERENCES global_products(id),
  local_name TEXT,
  local_image TEXT,
  local_category_id UUID REFERENCES bar_categories(id),
  price DECIMAL(10,2) NOT NULL,
  stock INTEGER DEFAULT 0,
  alert_threshold INTEGER DEFAULT 10,
  is_custom_product BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Autres tables (supplies, sales, promotions, etc.)
CREATE TABLE supplies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bar_id UUID NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES bar_products(id),
  quantity INTEGER NOT NULL,
  unit_cost DECIMAL(10,2) NOT NULL,
  total_cost DECIMAL(10,2) NOT NULL,
  supplier_name TEXT,
  supplier_phone TEXT,
  notes TEXT,
  supplied_by UUID NOT NULL REFERENCES users(id),
  supplied_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bar_id UUID NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  items JSONB NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  discount_total DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'mobile_money', 'card', 'credit')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'validated', 'rejected')),
  sold_by UUID NOT NULL REFERENCES users(id),
  validated_by UUID REFERENCES users(id),
  customer_name TEXT,
  customer_phone TEXT,
  notes TEXT,
  applied_promotions JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  validated_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  bar_id UUID REFERENCES bars(id),
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  context_type TEXT,
  context_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  tokens_used INTEGER,
  feedback INTEGER
);

-- Index pour performance
CREATE INDEX idx_bar_members_user_id ON bar_members(user_id);
CREATE INDEX idx_bar_members_bar_id ON bar_members(bar_id);
CREATE INDEX idx_bar_products_bar_id ON bar_products(bar_id);
CREATE INDEX idx_sales_bar_id ON sales(bar_id);
CREATE INDEX idx_sales_created_at ON sales(created_at DESC);

-- =====================================================
-- MIGRATION 002: RLS POLICIES (Basique)
-- =====================================================

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE bars ENABLE ROW LEVEL SECURITY;
ALTER TABLE bar_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE bar_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;

-- Helper functions (version basique, seront remplacées par migration 004)
CREATE OR REPLACE FUNCTION auth_user_id() RETURNS UUID AS $$
  SELECT NULL::UUID;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION is_super_admin() RETURNS BOOLEAN AS $$
  SELECT false;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION is_bar_member(bar_id_param UUID) RETURNS BOOLEAN AS $$
  SELECT false;
$$ LANGUAGE SQL STABLE;

-- =====================================================
-- MIGRATION 004: CUSTOM AUTH COMPLETE
-- =====================================================

-- Supprimer l'ancienne table users et recréer avec password_hash
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

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_is_active ON users(is_active);

-- Fonctions custom auth
CREATE OR REPLACE FUNCTION get_current_user_id() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::UUID;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION set_user_session(user_id UUID) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.user_id', user_id::TEXT, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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

  -- FIX: Qualifier les colonnes avec le nom de la table
  UPDATE users u
  SET last_login_at = NOW()
  WHERE u.username = p_username
    AND u.password_hash = crypt(p_password, u.password_hash)
    AND u.is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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

CREATE OR REPLACE FUNCTION change_password(
  p_user_id UUID,
  p_old_password TEXT,
  p_new_password TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_password_valid BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = p_user_id
      AND password_hash = crypt(p_old_password, password_hash)
  ) INTO v_password_valid;

  IF NOT v_password_valid THEN
    RAISE EXCEPTION 'Ancien mot de passe incorrect';
  END IF;

  UPDATE users
  SET password_hash = crypt(p_new_password, gen_salt('bf')),
      first_login = false,
      updated_at = NOW()
  WHERE id = p_user_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Mise à jour des helper functions RLS
CREATE OR REPLACE FUNCTION is_super_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM bar_members
    WHERE user_id = get_current_user_id()
    AND role = 'super_admin'
    AND is_active = true
  );
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION is_bar_member(bar_id_param UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM bar_members
    WHERE user_id = get_current_user_id()
    AND bar_id = bar_id_param
    AND is_active = true
  );
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION get_user_role(bar_id_param UUID) RETURNS TEXT AS $$
  SELECT role FROM bar_members
  WHERE user_id = get_current_user_id()
  AND bar_id = bar_id_param
  AND is_active = true
  LIMIT 1;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION is_promoteur_or_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM bar_members
    WHERE user_id = get_current_user_id()
    AND role IN ('super_admin', 'promoteur')
    AND is_active = true
  );
$$ LANGUAGE SQL STABLE;

-- Fonction helper pour setup super admin (bypass RLS)
CREATE OR REPLACE FUNCTION setup_super_admin_bar(p_user_id UUID)
RETURNS TABLE (
  bar_id UUID,
  bar_name TEXT
) AS $$
DECLARE
  v_bar_id UUID;
  v_bar_name TEXT := 'BarTender System';
BEGIN
  -- Créer le bar
  INSERT INTO bars (name, owner_id, is_active)
  VALUES (v_bar_name, p_user_id, true)
  RETURNING id INTO v_bar_id;

  -- Créer l'entrée bar_members
  INSERT INTO bar_members (user_id, bar_id, role, assigned_by, is_active)
  VALUES (p_user_id, v_bar_id, 'super_admin', p_user_id, true);

  -- Retourner les infos
  RETURN QUERY SELECT v_bar_id, v_bar_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION setup_super_admin_bar(UUID) IS
  'Crée un bar et assigne un utilisateur comme super_admin (bypass RLS)';

-- RLS Policies pour users
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  USING (id = get_current_user_id() OR is_super_admin());

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (id = get_current_user_id());

CREATE POLICY "Admins can create users"
  ON users FOR INSERT
  WITH CHECK (is_promoteur_or_admin());

-- RLS Policies pour bars
CREATE POLICY "Bar members can view bars"
  ON bars FOR SELECT
  USING (
    is_super_admin() OR
    owner_id = get_current_user_id() OR
    is_bar_member(id)
  );

CREATE POLICY "Promoteurs can create bars"
  ON bars FOR INSERT
  WITH CHECK (is_promoteur_or_admin());

CREATE POLICY "Bar owners can update bars"
  ON bars FOR UPDATE
  USING (
    is_super_admin() OR
    owner_id = get_current_user_id() OR
    get_user_role(id) IN ('promoteur', 'gerant')
  );

-- RLS Policies pour AI conversations
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

-- =====================================================
-- FIN DU SETUP
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ DATABASE SETUP COMPLETE!';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '';
  RAISE NOTICE '📋 Next steps:';
  RAISE NOTICE '   1. Run: npx tsx scripts/create-super-admin.ts';
  RAISE NOTICE '   2. Login with username: admin, password: Admin@1234';
  RAISE NOTICE '';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
END $$;
