-- =====================================================
-- MIGRATION 040: Allow bar members to view each other
-- Date: 25 Novembre 2025
-- Description: Ajoute une politique RLS pour permettre aux membres
--              d'un bar de voir les profils des autres membres du même bar
-- =====================================================

-- Supprimer l'ancienne politique restrictive
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Super admins can view all users" ON public.users;
DROP POLICY IF EXISTS "Bar members can view team members" ON public.users;

-- Politique 1: Les utilisateurs peuvent voir leur propre profil
CREATE POLICY "Users can view own profile"
  ON public.users FOR SELECT
  USING (id = auth.uid());

-- Politique 2: Les super admins peuvent voir tous les profils
CREATE POLICY "Super admins can view all users"
  ON public.users FOR SELECT
  USING (is_super_admin());

-- Politique 3: Les membres d'un bar peuvent voir les autres membres du même bar
CREATE POLICY "Bar members can view team members"
  ON public.users FOR SELECT
  USING (
    EXISTS (
      SELECT 1 
      FROM public.bar_members bm1
      INNER JOIN public.bar_members bm2 ON bm1.bar_id = bm2.bar_id
      WHERE bm1.user_id = auth.uid()
        AND bm2.user_id = public.users.id
        AND bm1.is_active = true
        AND bm2.is_active = true
    )
  );

COMMENT ON POLICY "Users can view own profile" ON public.users IS 'Users can view their own profile';
COMMENT ON POLICY "Super admins can view all users" ON public.users IS 'Super admins can view all user profiles';
COMMENT ON POLICY "Bar members can view team members" ON public.users IS 'Members of a bar can view other members of the same bar';

RAISE NOTICE '✅ RLS policies updated to allow bar members to view each other';
