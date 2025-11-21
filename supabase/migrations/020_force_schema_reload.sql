-- =====================================================
-- MIGRATION 020: Force Schema Cache Reload & Verify Columns
-- Date: 21 Novembre 2025
-- =====================================================

-- 1. Ensure is_active column exists in bar_categories
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bar_categories' AND column_name = 'is_active') THEN
    ALTER TABLE bar_categories ADD COLUMN is_active BOOLEAN DEFAULT true;
  END IF;
END $$;

-- 2. Force Schema Cache Reload
-- This is the critical part to fix PGRST204
NOTIFY pgrst, 'reload schema';
