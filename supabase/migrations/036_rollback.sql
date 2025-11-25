-- =====================================================
-- ROLLBACK 036: Revert Auth Schema & RPC Changes
-- Date: 25 Novembre 2025
-- Description: Rollback migration for 036_fix_auth_schema_and_rpcs.sql
-- =====================================================

-- ⚠️ WARNING: This rollback assumes no new data was created using the new schema
-- If data was created with joined_at, it will be preserved but renamed back

-- 1. Drop RPCs
-- =====================================================
DROP FUNCTION IF EXISTS complete_first_login(UUID);
DROP FUNCTION IF EXISTS setup_promoter_bar(UUID, TEXT, JSONB);
DROP FUNCTION IF EXISTS assign_bar_member(UUID, UUID, TEXT, UUID);

-- 2. Revert Schema Changes
-- =====================================================
DO $$
DECLARE
  v_row_count INTEGER;
BEGIN
  -- Check existing data
  SELECT COUNT(*) INTO v_row_count FROM bar_members;
  RAISE NOTICE 'Rollback 036: Found % existing bar_members records', v_row_count;

  -- Rename joined_at back to assigned_at if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bar_members' AND column_name = 'joined_at'
  ) THEN
    RAISE NOTICE 'Rollback 036: Renaming joined_at back to assigned_at...';
    ALTER TABLE bar_members RENAME COLUMN joined_at TO assigned_at;
    RAISE NOTICE 'Rollback 036: ✓ Column renamed back';
  END IF;

  -- Make assigned_by NOT NULL again
  -- ⚠️ This will fail if there are NULL values
  RAISE NOTICE 'Rollback 036: Making assigned_by NOT NULL again...';
  
  -- First, check if there are NULL values
  SELECT COUNT(*) INTO v_row_count 
  FROM bar_members 
  WHERE assigned_by IS NULL;
  
  IF v_row_count > 0 THEN
    RAISE WARNING 'Rollback 036: Found % records with NULL assigned_by. Cannot make column NOT NULL.', v_row_count;
    RAISE NOTICE 'Rollback 036: Please manually fix NULL values before making column NOT NULL';
  ELSE
    ALTER TABLE bar_members ALTER COLUMN assigned_by SET NOT NULL;
    RAISE NOTICE 'Rollback 036: ✓ assigned_by is now NOT NULL';
  END IF;

  -- Verify data integrity
  SELECT COUNT(*) INTO v_row_count FROM bar_members;
  RAISE NOTICE 'Rollback 036: Verified % bar_members records after rollback', v_row_count;

END $$;

-- Notify schema reload
NOTIFY pgrst, 'reload schema';

RAISE NOTICE '✅ Rollback 036 completed';
