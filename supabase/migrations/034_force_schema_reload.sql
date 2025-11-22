-- =====================================================
-- MIGRATION 034: Force Schema Cache Reload
-- Date: 22 Novembre 2025
-- =====================================================

-- Notify PostgREST to reload the schema cache
-- This is necessary when new functions or tables are added
NOTIFY pgrst, 'reload schema';

-- Verify function existence (just for log)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'decrement_stock') THEN
    RAISE NOTICE 'Function decrement_stock exists.';
  ELSE
    RAISE WARNING 'Function decrement_stock NOT FOUND.';
  END IF;
END $$;
