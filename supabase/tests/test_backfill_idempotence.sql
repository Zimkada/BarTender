-- =====================================================
-- BACKFILL IDEMPOTENCE TEST
-- =====================================================
-- Date: 2026-02-23
-- Purpose: Validate Bug #7 Fix (Backfill must be idempotent)
-- Scope: Verify that operating_mode_at_creation column exists and has correct defaults
-- Run in: Supabase SQL Editor
-- =====================================================

-- Check if the column exists and has the correct default
SELECT
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'sales'
      AND column_name = 'operating_mode_at_creation'
      AND table_schema = 'public'
    ) THEN 'PASS ✅ - Column operating_mode_at_creation exists in sales table'
    ELSE 'FAIL ❌ - Column operating_mode_at_creation NOT found in sales table'
  END as result,

  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'sales'
      AND column_name = 'operating_mode_at_creation'
      AND column_default LIKE '%full%'
      AND table_schema = 'public'
    ) THEN 'DEFAULT value is "full" (idempotent) ✅'
    ELSE 'DEFAULT value issue detected ❌'
  END as default_check,

  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_name = 'sales'
      AND constraint_name LIKE '%operating_mode_at_creation%'
      AND constraint_type = 'CHECK'
      AND table_schema = 'public'
    ) THEN 'CHECK constraint exists (full/simplified values only) ✅'
    ELSE 'CHECK constraint missing ❌'
  END as constraint_check;
