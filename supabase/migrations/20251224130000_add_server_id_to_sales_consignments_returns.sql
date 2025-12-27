-- MIGRATION: Add server_id column to sales, consignments, and returns tables
-- DATE: 2025-12-24
-- PURPOSE: Support mode switching (full vs simplified) by tracking which server performed each operation
--
-- In full mode: server_id = UUID of the server who created the sale
-- In simplified mode: server_id = UUID of the server mapped from server_name
--
-- This is a backwards-compatible change (nullable column, no data disruption)

BEGIN;

-- =====================================================
-- STEP 1: Add server_id column to sales table
-- =====================================================
ALTER TABLE public.sales
ADD COLUMN IF NOT EXISTS server_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.sales.server_id IS 'UUID of the server who performed/was assigned to this sale. In full mode: creator. In simplified mode: mapped from server_name.';

-- =====================================================
-- STEP 2: Add server_id column to consignments table
-- =====================================================
ALTER TABLE public.consignments
ADD COLUMN IF NOT EXISTS server_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.consignments.server_id IS 'UUID of the server assigned to this consignment (for simplified mode filtering).';

-- =====================================================
-- STEP 3: Add server_id column to returns table
-- =====================================================
ALTER TABLE public.returns
ADD COLUMN IF NOT EXISTS server_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.returns.server_id IS 'UUID of the server assigned to this return (for simplified mode filtering).';

-- =====================================================
-- STEP 4: Create indexes for performance
-- =====================================================

-- Index for filtering sales by server in a bar
CREATE INDEX IF NOT EXISTS idx_sales_server_id
ON public.sales(bar_id, server_id)
WHERE server_id IS NOT NULL;

COMMENT ON INDEX idx_sales_server_id IS 'Improves performance of queries filtering sales by server within a bar.';

-- Index for filtering consignments by server in a bar
CREATE INDEX IF NOT EXISTS idx_consignments_server_id
ON public.consignments(bar_id, server_id)
WHERE server_id IS NOT NULL;

COMMENT ON INDEX idx_consignments_server_id IS 'Improves performance of queries filtering consignments by server within a bar.';

-- Index for filtering returns by server in a bar
CREATE INDEX IF NOT EXISTS idx_returns_server_id
ON public.returns(bar_id, server_id)
WHERE server_id IS NOT NULL;

COMMENT ON INDEX idx_returns_server_id IS 'Improves performance of queries filtering returns by server within a bar.';

-- =====================================================
-- STEP 5: Backfill server_id from existing data (full mode bars)
-- =====================================================
-- For full mode bars, server_id should match the creator (sold_by/createdBy)
-- This assumes existing data is from full mode (safe assumption at this point)

UPDATE public.sales
SET server_id = sold_by
WHERE server_id IS NULL
  AND sold_by IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.bars b
    WHERE b.id = sales.bar_id
    AND (b.settings->>'operatingMode' IS NULL OR b.settings->>'operatingMode' = 'full')
  );

UPDATE public.consignments
SET server_id = original_seller
WHERE server_id IS NULL
  AND original_seller IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.bars b
    WHERE b.id = consignments.bar_id
    AND (b.settings->>'operatingMode' IS NULL OR b.settings->>'operatingMode' = 'full')
  );

UPDATE public.returns
SET server_id = returned_by
WHERE server_id IS NULL
  AND returned_by IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.bars b
    WHERE b.id = returns.bar_id
    AND (b.settings->>'operatingMode' IS NULL OR b.settings->>'operatingMode' = 'full')
  );

COMMIT;
