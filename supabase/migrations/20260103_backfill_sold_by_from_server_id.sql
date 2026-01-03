-- MIGRATION: Backfill sold_by from server_id in simplified mode
-- DATE: 2026-01-03
-- PURPOSE: Fix sales where sold_by = gérant but should be sold_by = serveur (server_id)
--
-- CONTEXT:
-- In simplified mode, sold_by should always equal the actual server (server_id),
-- not the gérant who created the sale. This migration fixes all existing sales
-- where server_id is set but sold_by is different.

BEGIN;

-- =====================================================
-- STEP 1: Backfill sold_by from server_id
-- =====================================================
UPDATE public.sales
SET sold_by = server_id
WHERE server_id IS NOT NULL
  AND sold_by != server_id
  AND status = 'validated';

-- =====================================================
-- STEP 2: Verify the fix
-- =====================================================
-- SELECT COUNT(*) as mismatched_sales
-- FROM public.sales
-- WHERE server_id IS NOT NULL
--   AND sold_by != server_id
--   AND status = 'validated';
-- Expected result: 0 (all fixed)

COMMIT;
