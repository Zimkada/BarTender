-- =====================================================
-- MIGRATION 031: Fix bar_members foreign key
-- Date: 22 Novembre 2025
-- Description: Explicitly recreate the FK to ensure it exists and has a known name.
-- =====================================================

DO $$
BEGIN
  -- 1. Drop existing FK if it exists (try standard names)
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'bar_members_user_id_fkey') THEN
    ALTER TABLE bar_members DROP CONSTRAINT bar_members_user_id_fkey;
  END IF;

  -- 2. Add the FK with a specific name
  ALTER TABLE bar_members
  ADD CONSTRAINT fk_bar_members_user
  FOREIGN KEY (user_id)
  REFERENCES users(id)
  ON DELETE CASCADE;

  -- 3. Also fix assigned_by just in case
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'bar_members_assigned_by_fkey') THEN
    ALTER TABLE bar_members DROP CONSTRAINT bar_members_assigned_by_fkey;
  END IF;

  ALTER TABLE bar_members
  ADD CONSTRAINT fk_bar_members_assigned_by
  FOREIGN KEY (assigned_by)
  REFERENCES users(id);

END $$;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
