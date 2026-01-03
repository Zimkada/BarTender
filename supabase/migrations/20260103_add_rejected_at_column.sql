-- MIGRATION: Add rejected_at column to sales table
-- DATE: 2026-01-03
-- PURPOSE: Complete the rejection workflow by adding rejected_at timestamp

BEGIN;

-- =====================================================
-- STEP 1: Add rejected_at column
-- =====================================================
ALTER TABLE public.sales
ADD COLUMN rejected_at TIMESTAMPTZ;

-- =====================================================
-- STEP 2: Backfill rejected_at for existing rejected sales
-- =====================================================
UPDATE public.sales
SET rejected_at = updated_at
WHERE status = 'rejected' AND rejected_at IS NULL;

-- =====================================================
-- STEP 3: Add constraint to ensure consistency
-- =====================================================
-- The existing CHECK constraint should already enforce this:
-- (status = 'rejected' AND rejected_by IS NOT NULL AND rejected_at IS NOT NULL)

COMMIT;
