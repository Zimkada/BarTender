-- Migration: Delete orphaned supply expense duplicates
-- Description: Removes manual 'supply' category expenses that duplicate entries in supplies table
-- Author: Antigravity
-- Date: 2026-02-25
--
-- Context: When supplies are created, they shouldn't also exist as manual expenses.
-- Old code created both entries. This migration cleans up the duplicates.

DELETE FROM expenses
WHERE category = 'supply'
  AND related_supply_id IS NULL
  AND id IN (
    '0e4ac3dd-e043-48f5-94b4-403d1a0ac0dc',
    'cdd65575-eb7f-41d7-b888-21a6d1ce104a',
    'eb1d0cd9-efbb-4bde-bc11-9bc758ca2089',
    '44a0389c-64f7-4f2e-99ab-e9372a02d6e1',
    'f918afe4-8a63-4a8c-8647-887bcf770089',
    '1316e0da-018e-4657-b4f6-eabcd845e3a2',
    '873522b2-7dcd-4445-bc9a-c9c32a91b2a1',
    '789bee66-a3d6-4b88-8877-a2c4b2b372eb',
    '2b9d2569-879a-4b04-9cb5-1625ffcd0d0f'
  );

-- Verify deletion
-- SELECT COUNT(*) FROM expenses WHERE category = 'supply' AND related_supply_id IS NULL;
-- Should return 0
