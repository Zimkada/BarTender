-- =====================================================
-- MIGRATION 009: Migration vers Supabase Auth
-- Date: 20 Novembre 2025
-- =====================================================

-- STRATÉGIE : Repartir de zéro avec architecture propre
-- Les données de test seront supprimées et recréées

-- =====================================================
-- ÉTAPE 1: NETTOYER LES ANCIENNES DONNÉES DE TEST
-- =====================================================

-- Supprimer toutes les données de test (ATTENTION: à ne faire qu'en dev!)
-- Seulement si les tables existent
DO $$
BEGIN
  -- Supprimer les données dans l'ordre (à cause des foreign keys)
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'bar_members') THEN
    TRUNCATE TABLE bar_members CASCADE;
  END IF;

  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'bars') THEN
    TRUNCATE TABLE bars CASCADE;
  END IF;

  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'users') THEN
    TRUNCATE TABLE users CASCADE;
  END IF;

  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'audit_logs') THEN
    TRUNCATE TABLE audit_logs CASCADE;
  END IF;
END $$;

-- =====================================================
-- ÉTAPE 2: MODIFIER LA TABLE USERS
-- =====================================================

-- Ajouter la colonne email (obligatoire)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS email TEXT UNIQUE NOT NULL;

-- Modifier username pour être optionnel (juste pour affichage)
ALTER TABLE users
ALTER COLUMN username DROP NOT NULL;

-- Mettre à jour les constraints
ALTER TABLE users
DROP CONSTRAINT IF EXISTS username_length;

ALTER TABLE users
DROP CONSTRAINT IF EXISTS username_format;

-- Ajouter constraint email
ALTER TABLE users
ADD CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$');

-- Supprimer password_hash (géré par auth.users)
ALTER TABLE users
DROP COLUMN IF EXISTS password_hash;

-- Index pour performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

COMMENT ON COLUMN users.email IS 'Email utilisateur (authentification Supabase)';
COMMENT ON COLUMN users.username IS 'Nom d''affichage optionnel';

-- =====================================================
-- ÉTAPE 3: CRÉER LES TRIGGERS DE SYNCHRONISATION
-- =====================================================

-- Fonction pour créer le profil quand un user est créé dans auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Créer le profil dans public.users
  INSERT INTO public.users (
    id,
    email,
    username,
    name,
    phone,
    avatar_url,
    is_active,
    first_login,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'username', SPLIT_PART(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    NEW.raw_user_meta_data->>'avatar_url',
    true,
    true,
    NOW(),
    NOW()
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log l'erreur mais ne bloque pas la création dans auth.users
    RAISE WARNING 'Erreur lors de la création du profil: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger sur auth.users (création)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Fonction pour synchroniser les mises à jour
CREATE OR REPLACE FUNCTION public.handle_user_update()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.users
  SET
    email = NEW.email,
    name = COALESCE(NEW.raw_user_meta_data->>'name', name),
    phone = COALESCE(NEW.raw_user_meta_data->>'phone', phone),
    avatar_url = NEW.raw_user_meta_data->>'avatar_url',
    updated_at = NOW()
  WHERE id = NEW.id;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Erreur lors de la mise à jour du profil: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger sur auth.users (mise à jour)
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_update();

-- =====================================================
-- ÉTAPE 4: SUPPRIMER LES POLICIES QUI DÉPENDENT DE get_current_user_id()
-- =====================================================

-- Supprimer toutes les policies qui utilisent get_current_user_id()
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Super admins can view all users" ON users;
DROP POLICY IF EXISTS "Admins can create users" ON users;
DROP POLICY IF EXISTS "Bar members can view bars" ON bars;
DROP POLICY IF EXISTS "Bar owners can update bars" ON bars;
DROP POLICY IF EXISTS "Bar members can view their bars" ON bars;
DROP POLICY IF EXISTS "Promoteurs can create bars" ON bars;
DROP POLICY IF EXISTS "Users can view own AI conversations" ON ai_conversations;
DROP POLICY IF EXISTS "Users can create AI conversations" ON ai_conversations;
DROP POLICY IF EXISTS "Users can update own AI conversations" ON ai_conversations;
DROP POLICY IF EXISTS "Users can view own bar memberships" ON bar_members;
DROP POLICY IF EXISTS "Members can view bar members" ON bar_members;
DROP POLICY IF EXISTS "Managers can add members" ON bar_members;
DROP POLICY IF EXISTS "Managers can update members" ON bar_members;

-- =====================================================
-- ÉTAPE 5: METTRE À JOUR LES RLS HELPER FUNCTIONS
-- =====================================================

-- Maintenant on peut supprimer l'ancienne fonction
DROP FUNCTION IF EXISTS get_current_user_id();

-- Mettre à jour is_super_admin pour utiliser auth.uid()
CREATE OR REPLACE FUNCTION is_super_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM bar_members
    WHERE user_id = auth.uid()
    AND role = 'super_admin'
    AND is_active = true
  );
$$ LANGUAGE SQL STABLE;

-- Mettre à jour is_bar_member
CREATE OR REPLACE FUNCTION is_bar_member(bar_id_param UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM bar_members
    WHERE user_id = auth.uid()
    AND bar_id = bar_id_param
    AND is_active = true
  );
$$ LANGUAGE SQL STABLE;

-- Mettre à jour get_user_role
CREATE OR REPLACE FUNCTION get_user_role(bar_id_param UUID) RETURNS TEXT AS $$
  SELECT role FROM bar_members
  WHERE user_id = auth.uid()
  AND bar_id = bar_id_param
  AND is_active = true
  LIMIT 1;
$$ LANGUAGE SQL STABLE;

-- Mettre à jour is_promoteur_or_admin
CREATE OR REPLACE FUNCTION is_promoteur_or_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM bar_members
    WHERE user_id = auth.uid()
    AND role IN ('super_admin', 'promoteur')
    AND is_active = true
  );
$$ LANGUAGE SQL STABLE;

-- =====================================================
-- ÉTAPE 6: RECRÉER LES RLS POLICIES AVEC auth.uid()
-- =====================================================

-- Users policies
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  USING (id = auth.uid() OR is_super_admin());

CREATE POLICY "Super admins can view all users"
  ON users FOR SELECT
  USING (is_super_admin());

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY "Admins can create users"
  ON users FOR INSERT
  WITH CHECK (is_promoteur_or_admin());

-- Bars policies
CREATE POLICY "Bar members can view bars"
  ON bars FOR SELECT
  USING (is_bar_member(id) OR is_super_admin());

CREATE POLICY "Bar owners can update bars"
  ON bars FOR UPDATE
  USING (
    is_super_admin() OR
    owner_id = auth.uid() OR
    get_user_role(id) IN ('promoteur', 'gerant')
  );

-- Bar members policies
CREATE POLICY "Users can view own bar memberships"
  ON bar_members FOR SELECT
  USING (
    user_id = auth.uid() OR
    is_bar_member(bar_id) OR
    is_super_admin()
  );

-- AI Conversations policies
CREATE POLICY "Users can view own AI conversations"
  ON ai_conversations FOR SELECT
  USING (
    user_id = auth.uid() OR
    (bar_id IS NOT NULL AND is_bar_member(bar_id)) OR
    is_super_admin()
  );

CREATE POLICY "Users can create AI conversations"
  ON ai_conversations FOR INSERT
  WITH CHECK (
    user_id = auth.uid() OR
    is_super_admin()
  );

CREATE POLICY "Users can update own AI conversations"
  ON ai_conversations FOR UPDATE
  USING (
    user_id = auth.uid() OR
    is_super_admin()
  );

-- =====================================================
-- ÉTAPE 7: SUPPRIMER LES FONCTIONS OBSOLÈTES
-- =====================================================

-- Supprimer les anciennes fonctions custom auth
DROP FUNCTION IF EXISTS login_user(TEXT, TEXT);
DROP FUNCTION IF EXISTS set_user_session(UUID);
DROP FUNCTION IF EXISTS validate_password(TEXT, TEXT);
DROP FUNCTION IF EXISTS create_user(TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS change_password(UUID, TEXT, TEXT);

-- =====================================================
-- ÉTAPE 8: NOTES ET PROCHAINES ÉTAPES
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ MIGRATION VERS SUPABASE AUTH TERMINÉE !';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '';
  RAISE NOTICE '📋 PROCHAINES ÉTAPES:';
  RAISE NOTICE '   1. Créer le super admin via Supabase Dashboard:';
  RAISE NOTICE '      - Email: admin@bartender.local (ou votre email)';
  RAISE NOTICE '      - Password: Admin@1234';
  RAISE NOTICE '      - Metadata: {"name": "Super Admin", "phone": "+229...", "username": "admin"}';
  RAISE NOTICE '';
  RAISE NOTICE '   2. Créer le membership super_admin manuellement:';
  RAISE NOTICE '      INSERT INTO bar_members (user_id, bar_id, role, assigned_by, is_active)';
  RAISE NOTICE '      VALUES (''<uuid-du-super-admin>'', ''00000000-0000-0000-0000-000000000000'', ''super_admin'', ''<uuid-du-super-admin>'', true);';
  RAISE NOTICE '';
  RAISE NOTICE '   3. Mettre à jour le frontend (AuthService)';
  RAISE NOTICE '';
  RAISE NOTICE '🔒 SÉCURITÉ:';
  RAISE NOTICE '   • Authentification gérée par Supabase Auth';
  RAISE NOTICE '   • JWT automatique';
  RAISE NOTICE '   • RLS fonctionne avec auth.uid()';
  RAISE NOTICE '   • Récupération de mot de passe par email disponible';
  RAISE NOTICE '';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
END $$;
