-- Migration: Mark legacy bars as setup complete
-- Purpose: Fix the indicator for old bars that were created before onboarding system
-- Date: 2026-01-13
-- Description: All bars that have been created before should be marked as setup_complete
-- to avoid showing the incomplete setup indicator for existing bars

BEGIN;

-- Update all bars that are not marked as setup_complete to be setup_complete
-- This applies to legacy bars created before the onboarding system
UPDATE bars
SET is_setup_complete = true
WHERE is_setup_complete = false;

-- Verify the update
SELECT COUNT(*) as total_bars,
       COUNT(CASE WHEN is_setup_complete THEN 1 END) as setup_complete_count
FROM bars;

COMMIT;
