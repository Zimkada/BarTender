-- =====================================================
-- MIGRATION 041: Fix User Update Policy
-- Date: 25 Novembre 2025
-- Description: Assure que les utilisateurs peuvent mettre à jour leur propre profil
--              Correction du bug où les modifications sont perdues après déconnexion
-- =====================================================

-- Supprimer l'ancienne politique si elle existe
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;

-- Créer la politique de mise à jour
CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

COMMENT ON POLICY "Users can update own profile" ON public.users IS 'Users can update their own profile data';

RAISE NOTICE '✅ RLS policy for user updates fixed';
