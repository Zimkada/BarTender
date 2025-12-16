-- =====================================================
-- MIGRATION 20251216090000: Set is_active NOT NULL with DEFAULT
-- Date: 2025-12-16 09:00:00
-- Description: Fix Issue #16 - is_active nullable causing query errors
-- =====================================================

-- =====================================================
-- ISSUE #16: is_active missing/nullable
-- Problème: global_categories n'a pas is_active, global_products l'a mais nullable
-- Solution: Créer is_active sur global_categories, rendre NOT NULL sur les deux
-- =====================================================

-- 1. Fix global_products.is_active (column exists but nullable)
-- Set DEFAULT for future inserts
ALTER TABLE global_products
ALTER COLUMN is_active SET DEFAULT true;

-- Update any NULL values (should be none, but safety first)
UPDATE global_products
SET is_active = true
WHERE is_active IS NULL;

-- Add NOT NULL constraint
ALTER TABLE global_products
ALTER COLUMN is_active SET NOT NULL;

COMMENT ON COLUMN global_products.is_active IS 'Product active status - NOT NULL with DEFAULT true for soft-delete';

-- 2. Add is_active to global_categories (column does not exist)
-- Add column with DEFAULT true and NOT NULL
ALTER TABLE global_categories
ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN global_categories.is_active IS 'Category active status - NOT NULL with DEFAULT true for soft-delete';

-- =====================================================
-- Verification queries (for documentation)
-- =====================================================

-- Verify constraints
-- SELECT column_name, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_name IN ('global_products', 'global_categories')
-- AND column_name = 'is_active';

-- Expected result:
-- global_products.is_active: is_nullable='NO', column_default='true'
-- global_categories.is_active: is_nullable='NO', column_default='true'
