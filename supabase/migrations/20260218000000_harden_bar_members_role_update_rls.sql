-- =====================================================
-- MIGRATION: Harden bar_members UPDATE RLS
-- DATE: 2026-02-18
--
-- PROBLEM:
--   The existing UPDATE policy allows any 'gerant' to UPDATE any column
--   on bar_members rows, including the 'role' column. This means a gerant
--   could bypass the UI and directly call:
--     supabase.from('bar_members').update({ role: 'promoteur' })
--   to self-promote or escalate another member's role.
--
-- FIX:
--   Add a WITH CHECK clause that restricts gerant to only set role = 'serveur'.
--   Promoteurs and super_admins retain full UPDATE authority.
-- =====================================================

BEGIN;

-- Drop the old permissive UPDATE policy
DROP POLICY IF EXISTS "Promoteurs can update bar members" ON public.bar_members;

-- Recreate with WITH CHECK to block gerant role escalation
CREATE POLICY "bar_members_update_policy"
  ON public.bar_members FOR UPDATE
  USING (
    is_super_admin() OR
    get_user_role(bar_id) IN ('promoteur', 'gerant')
  )
  WITH CHECK (
    is_super_admin() OR
    get_user_role(bar_id) = 'promoteur' OR
    -- Gérant can update members but cannot set role above 'serveur'
    (get_user_role(bar_id) = 'gerant' AND role = 'serveur')
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
