-- ===================================================================
-- MIGRATION: Add onboarding setup tracking to bars table
-- DATE: 2026-01-08
-- AUTHOR: Claude Code
-- ===================================================================

-- PROBLEM:
-- No way to track if bar setup is complete (propriétaire must go through 7-step workflow)
-- Need to block gérant/serveur from creating sales if bar setup incomplete

-- IMPACT:
-- All bars | Onboarding workflow | Role-based access control

-- SOLUTION:
-- Add is_setup_complete (boolean) + setup_completed_at (timestamp) to bars table
-- Default: false (new bars start incomplete)

-- BREAKING_CHANGE: NO (additive columns, backward compatible)

-- APPROACH:
-- Existing bars set to is_setup_complete=true (already have data)
-- New bars start with is_setup_complete=false (must complete onboarding)

-- RLS_CHANGES: None (bars table RLS unchanged)

-- TAGS: #feature #onboarding

BEGIN;

-- Step 1: Add columns to bars table
ALTER TABLE bars
ADD COLUMN is_setup_complete BOOLEAN DEFAULT false,
ADD COLUMN setup_completed_at TIMESTAMPTZ;

-- Step 2: Add comments
COMMENT ON COLUMN bars.is_setup_complete IS 'Onboarding complete: propriétaire finished 7-step setup';
COMMENT ON COLUMN bars.setup_completed_at IS 'Timestamp when onboarding workflow finished (launched bar)';

-- Step 3: Backfill existing bars (assume already setup since they have data)
UPDATE bars
SET is_setup_complete = true, setup_completed_at = NOW()
WHERE is_setup_complete = false
  AND created_at < NOW() - INTERVAL '1 day';

-- Step 4: Create index for queries filtering by setup status
CREATE INDEX idx_bars_setup_complete ON bars(is_setup_complete);

-- Step 5: Data validation
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM bars WHERE is_setup_complete = true AND setup_completed_at IS NULL) THEN
    RAISE EXCEPTION 'Backfill error: bars with is_setup_complete=true must have setup_completed_at';
  END IF;
END $$;

COMMIT;

-- ===================================================================
-- POST-MIGRATION NOTES
-- ===================================================================
-- Backfilled: Existing bars marked as setup_complete (they have historical data)
-- New bars: Start with is_setup_complete=false, must complete onboarding
-- Frontend: Add routing guard to redirect to /onboarding if not complete
-- Gérant/Serveur: Cannot create sales if bar.is_setup_complete = false
