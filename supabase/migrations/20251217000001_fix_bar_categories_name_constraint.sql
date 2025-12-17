-- Fix bar_categories name column constraint issue
-- Issue: The "name" column in bar_categories is NOT NULL but should be nullable
-- The modern schema uses (global_category_id OR custom_name), not "name"
-- When setup_promoter_bar tries to insert linked global categories, it fails because "name" is NULL

-- 1. Check if "name" column exists and is NOT NULL
DO $$
DECLARE
  v_column_exists BOOLEAN;
  v_is_not_null BOOLEAN;
BEGIN
  -- Check if column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bar_categories' AND column_name = 'name'
  ) INTO v_column_exists;

  IF v_column_exists THEN
    -- Check if it's NOT NULL
    SELECT is_nullable = 'NO' INTO v_is_not_null
    FROM information_schema.columns
    WHERE table_name = 'bar_categories' AND column_name = 'name';

    IF v_is_not_null THEN
      -- Make it nullable
      ALTER TABLE bar_categories ALTER COLUMN name DROP NOT NULL;
      RAISE NOTICE '[fix_bar_categories] Made "name" column nullable';
    ELSE
      RAISE NOTICE '[fix_bar_categories] "name" column already nullable';
    END IF;
  ELSE
    RAISE NOTICE '[fix_bar_categories] "name" column does not exist (expected modern schema)';
  END IF;
END $$;

-- 2. Populate any NULL names with generated names (for data integrity)
-- This is a safety measure for existing records
DO $$
BEGIN
  UPDATE bar_categories
  SET name = 'Category ' || SUBSTRING(id::text, 1, 8)
  WHERE name IS NULL AND global_category_id IS NOT NULL;

  IF FOUND THEN
    RAISE NOTICE '[fix_bar_categories] Populated % null category names', FOUND;
  END IF;
END $$;

-- 3. Reload schema cache for Supabase
NOTIFY pgrst, 'reload schema';

-- 4. Log migration completion via a final DO block
DO $$
BEGIN
  RAISE NOTICE '[fix_bar_categories] Migration completed - bar_categories.name is now nullable';
END $$;
