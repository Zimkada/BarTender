-- =====================================================
-- MIGRATION 011: DEBUG - Temporarily disable RLS on users table for SELECT
-- Date: 20 Novembre 2025
-- =====================================================

-- ATTENTION: CECI EST UNE MESURE DE DÉBOGAGE TEMPORAIRE.
-- NE LA LAISSEZ PAS EN PRODUCTION.

-- Supprimer la politique existante pour la lecture des profils utilisateurs
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;

-- Créer une nouvelle politique qui autorise TOUTES les lectures sur la table users
-- Ceci est fait pour vérifier si la politique RLS est la cause du blocage.
CREATE POLICY "Users can view own profile"
  ON public.users FOR SELECT
  USING (true);

COMMENT ON POLICY "Users can view own profile" ON public.users IS 'DEBUG: Temporarily allows all users to view any profile for debugging purposes.';
