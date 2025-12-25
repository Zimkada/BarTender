-- MIGRATION: Backfill server_id in returns, sales, and consignments tables
-- DATE: 2025-12-25
-- PURPOSE: Ensure all existing records have server_id populated for proper server filtering
--
-- This is critical for the server filtering to work correctly in both simplified and full modes.
-- Previously, these records were created with NULL server_id. Now we fill those gaps by:
-- 1. Using the associated sale's server_id (preferred)
-- 2. Falling back to sold_by, returned_by, or original_seller if needed

BEGIN;

-- =====================================================
-- STEP 1: Backfill sales.server_id (if not already set)
-- =====================================================
-- Use sold_by as the server_id for full mode bars
UPDATE public.sales s
SET server_id = s.sold_by
WHERE server_id IS NULL
  AND sold_by IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.bars b
    WHERE b.id = s.bar_id
  );

-- =====================================================
-- STEP 2: Backfill returns.server_id from associated sales
-- =====================================================
-- For each return without a server_id, find the associated sale and use its server_id
UPDATE public.returns r
SET server_id = s.server_id
FROM public.sales s
WHERE r.sale_id = s.id
  AND r.server_id IS NULL
  AND s.server_id IS NOT NULL;

-- =====================================================
-- STEP 3: For returns whose sale still doesn't have server_id, use sale.sold_by as fallback
-- =====================================================
UPDATE public.returns r
SET server_id = s.sold_by
FROM public.sales s
WHERE r.sale_id = s.id
  AND r.server_id IS NULL
  AND s.sold_by IS NOT NULL;

-- =====================================================
-- STEP 4: For returns with no associated sale, use returned_by
-- =====================================================
UPDATE public.returns
SET server_id = returned_by
WHERE server_id IS NULL
  AND returned_by IS NOT NULL;

-- =====================================================
-- STEP 5: Backfill consignments.server_id from associated sales
-- =====================================================
UPDATE public.consignments c
SET server_id = s.server_id
FROM public.sales s
WHERE c.sale_id = s.id
  AND c.server_id IS NULL
  AND s.server_id IS NOT NULL;

-- =====================================================
-- STEP 6: For consignments whose sale doesn't have server_id, use original_seller as fallback
-- =====================================================
UPDATE public.consignments
SET server_id = original_seller
WHERE server_id IS NULL
  AND original_seller IS NOT NULL;

COMMIT;

-- Verification queries (run after migration if needed):
-- SELECT COUNT(*) as sales_with_server_id FROM public.sales WHERE server_id IS NOT NULL;
-- SELECT COUNT(*) as sales_without_server_id FROM public.sales WHERE server_id IS NULL;
-- SELECT COUNT(*) as returns_with_server_id FROM public.returns WHERE server_id IS NOT NULL;
-- SELECT COUNT(*) as returns_without_server_id FROM public.returns WHERE server_id IS NULL;
-- SELECT COUNT(*) as consignments_with_server_id FROM public.consignments WHERE server_id IS NOT NULL;
-- SELECT COUNT(*) as consignments_without_server_id FROM public.consignments WHERE server_id IS NULL;
