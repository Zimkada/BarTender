-- =====================================================
-- MIGRATION 022: Fix Bar Categories Name Constraint
-- Date: 21 Novembre 2025
-- =====================================================

-- The error "null value in column "name" ... violates not-null constraint"
-- indicates that there is a 'name' column that is required.
-- Since we are using 'custom_name' for custom categories and 'global_category_id' for linked ones,
-- 'name' should be nullable (or not exist if we fully switched to custom_name).

-- 1. Make 'name' column nullable if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bar_categories' AND column_name = 'name') THEN
    ALTER TABLE bar_categories ALTER COLUMN name DROP NOT NULL;
  END IF;
END $$;

-- 2. Reload schema cache
NOTIFY pgrst, 'reload schema';
