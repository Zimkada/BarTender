-- =====================================================
-- MIGRATION 013: Restore secure RLS policy on users table
-- Date: 20 Novembre 2025
-- =====================================================

-- Ce script annule la modification de débogage de la migration 011
-- et restaure la politique de sécurité normale.

-- Supprimer la politique de débogage temporaire
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;

-- Recréer la politique de sécurité normale
-- Les utilisateurs ne peuvent voir que leur propre profil,
-- sauf les super admins qui peuvent voir tout le monde.
CREATE POLICY "Users can view own profile"
  ON public.users FOR SELECT
  USING (id = auth.uid() OR is_super_admin());

COMMENT ON POLICY "Users can view own profile" ON public.users IS 'Restores the secure policy where users can only view their own profile, or super admins can view all.';
