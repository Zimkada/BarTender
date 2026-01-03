-- MIGRATION: Remove gérant/promoteur entries from server_name_mappings
-- DATE: 2026-01-02
-- PURPOSE: Enforce that only serveurs (servers) can be selected in simplified mode
--
-- CONTEXT:
-- In simplified mode, the dropdown should only show servers available for assignment.
-- Gérants and promoteurs should NOT appear in the list because:
-- 1. They are managers, not vendors
-- 2. In simplified mode, they CANNOT be assigned sales
-- 3. If they want to sell, they should switch to full mode
--
-- This migration removes any gérant/promoteur entries from server_name_mappings
-- to prevent them from appearing in the server selection dropdown.

BEGIN;

-- =====================================================
-- STEP 1: Identify and remove manager entries
-- =====================================================

DELETE FROM public.server_name_mappings
WHERE user_id IN (
  SELECT bm.user_id
  FROM public.bar_members bm
  WHERE bm.role IN ('gerant', 'promoteur', 'super_admin')
  AND bm.is_active = true
);

-- =====================================================
-- STEP 2: Add constraint to prevent re-insertion
-- =====================================================

-- Note: This constraint is enforced at the application level via RLS policies.
-- No database-level constraint needed since server_name_mappings
-- doesn't have a direct reference to bar_members.role

-- =====================================================
-- STEP 3: Verify cleanup
-- =====================================================

-- Verify that only servers remain in the mapping
-- SELECT DISTINCT sm.server_name, bm.role, bm.is_active
-- FROM public.server_name_mappings sm
-- JOIN public.bar_members bm ON sm.user_id = bm.user_id
-- WHERE sm.bar_id IN (SELECT id FROM public.bars);
-- Expected result: All roles should be 'serveur'

COMMIT;
