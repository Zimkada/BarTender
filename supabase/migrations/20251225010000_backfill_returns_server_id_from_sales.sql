-- MIGRATION: Backfill server_id in returns table from associated sales
-- DATE: 2025-12-25
-- PURPOSE: Ensure all existing returns have server_id populated from their associated sales
--
-- This is critical for the server filtering to work correctly in simplified mode.
-- Previously, returns were created with NULL server_id because the system didn't
-- deduce it from the sale. Now we fill those gaps.

BEGIN;

-- =====================================================
-- STEP 1: Backfill returns.server_id from sales.server_id
-- =====================================================
-- For each return without a server_id, find the associated sale and use its server_id

UPDATE public.returns r
SET server_id = s.server_id
FROM public.sales s
WHERE r.sale_id = s.id
  AND r.server_id IS NULL
  AND s.server_id IS NOT NULL;

-- =====================================================
-- STEP 2: For returns whose sale doesn't have server_id, use sale.sold_by as fallback
-- =====================================================
-- This handles older sales that might not have server_id set yet

UPDATE public.returns r
SET server_id = s.sold_by
FROM public.sales s
WHERE r.sale_id = s.id
  AND r.server_id IS NULL
  AND s.sold_by IS NOT NULL;

-- =====================================================
-- STEP 3: Log the operation
-- =====================================================
-- For auditing, we can check how many returns were updated

COMMIT;

-- Verification query (run after migration if needed):
-- SELECT COUNT(*) as returns_with_server_id FROM public.returns WHERE server_id IS NOT NULL;
-- SELECT COUNT(*) as returns_without_server_id FROM public.returns WHERE server_id IS NULL;
