-- MIGRATION: Add operating_mode_at_creation to sales, consignments, and returns
-- DATE: 2025-12-26
-- PURPOSE: Track the operating mode when each record was created to handle mode switching
--
-- PROBLEM: When a bar switches from full to simplified mode (or vice versa):
--   - Old records: server_id = createdBy (full mode logic)
--   - New records: server_id = assigned server (simplified mode logic)
--   - Filtering breaks: servers see wrong data
--
-- SOLUTION: Store the operating mode at creation time so filtering logic can adapt
--
-- EXAMPLES:
--   - Sale created in full mode → operating_mode_at_creation = 'full'
--     * Filter: server_id = createdBy (creator is the server)
--   - Sale created in simplified mode → operating_mode_at_creation = 'simplified'
--     * Filter: server_id = assigned server (different from creator)

BEGIN;

-- =====================================================
-- STEP 1: Add operating_mode_at_creation to sales
-- =====================================================
ALTER TABLE public.sales
ADD COLUMN IF NOT EXISTS operating_mode_at_creation TEXT DEFAULT 'full'
CHECK (operating_mode_at_creation IN ('full', 'simplified'));

COMMENT ON COLUMN public.sales.operating_mode_at_creation IS
  'Operating mode of the bar when this sale was created. Used to correctly interpret server_id during mode switches.';

-- =====================================================
-- STEP 2: Add operating_mode_at_creation to consignments
-- =====================================================
ALTER TABLE public.consignments
ADD COLUMN IF NOT EXISTS operating_mode_at_creation TEXT DEFAULT 'full'
CHECK (operating_mode_at_creation IN ('full', 'simplified'));

COMMENT ON COLUMN public.consignments.operating_mode_at_creation IS
  'Operating mode of the bar when this consignment was created. Used to correctly interpret server_id during mode switches.';

-- =====================================================
-- STEP 3: Add operating_mode_at_creation to returns
-- =====================================================
ALTER TABLE public.returns
ADD COLUMN IF NOT EXISTS operating_mode_at_creation TEXT DEFAULT 'full'
CHECK (operating_mode_at_creation IN ('full', 'simplified'));

COMMENT ON COLUMN public.returns.operating_mode_at_creation IS
  'Operating mode of the bar when this return was created. Used to correctly interpret server_id during mode switches.';

-- =====================================================
-- STEP 4: Backfill existing data
-- =====================================================
-- Assume all existing data was created in the current bar's mode
-- (This is safe because mode switching is new functionality)

UPDATE public.sales s
SET operating_mode_at_creation = COALESCE(
  (SELECT b.settings->>'operatingMode' FROM public.bars b WHERE b.id = s.bar_id),
  'full'
)
WHERE operating_mode_at_creation IS NULL OR operating_mode_at_creation = 'full';

UPDATE public.consignments c
SET operating_mode_at_creation = COALESCE(
  (SELECT b.settings->>'operatingMode' FROM public.bars b WHERE b.id = c.bar_id),
  'full'
)
WHERE operating_mode_at_creation IS NULL OR operating_mode_at_creation = 'full';

UPDATE public.returns r
SET operating_mode_at_creation = COALESCE(
  (SELECT b.settings->>'operatingMode' FROM public.bars b WHERE b.id = r.bar_id),
  'full'
)
WHERE operating_mode_at_creation IS NULL OR operating_mode_at_creation = 'full';

COMMIT;
