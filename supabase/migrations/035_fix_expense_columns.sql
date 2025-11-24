-- =====================================================
-- MIGRATION 035: Fix Missing Expense Columns
-- Date: 22 Novembre 2025
-- =====================================================

-- 1. Add is_active column to expense_categories_custom
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'expense_categories_custom'
    AND column_name = 'is_active'
  ) THEN
    ALTER TABLE expense_categories_custom
    ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;

    RAISE NOTICE 'Column is_active added to expense_categories_custom';
  ELSE
    RAISE NOTICE 'Column is_active already exists in expense_categories_custom';
  END IF;
END $$;

-- 2. Add expense_date column to expenses (in addition to existing date column)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'expenses'
    AND column_name = 'expense_date'
  ) THEN
    -- Add the column with default NOW()
    ALTER TABLE expenses
    ADD COLUMN expense_date TIMESTAMPTZ NOT NULL DEFAULT NOW();

    -- Copy existing date values to expense_date if table has data
    UPDATE expenses SET expense_date = date WHERE date IS NOT NULL;

    RAISE NOTICE 'Column expense_date added to expenses';
  ELSE
    RAISE NOTICE 'Column expense_date already exists in expenses';
  END IF;
END $$;

-- 3. Reload schema cache
NOTIFY pgrst, 'reload schema';

-- 4. Verify columns exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'expense_categories_custom'
    AND column_name = 'is_active'
  ) THEN
    RAISE NOTICE 'VERIFIED: expense_categories_custom.is_active exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'expenses'
    AND column_name = 'expense_date'
  ) THEN
    RAISE NOTICE 'VERIFIED: expenses.expense_date exists';
  END IF;
END $$;
