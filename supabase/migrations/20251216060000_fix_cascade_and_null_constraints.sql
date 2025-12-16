-- =====================================================
-- MIGRATION 20251216060000: Fix cascade behavior and NULL constraints
-- Date: 2025-12-16 06:00:00
-- Description: Fix Issues #4 and #10 - Cascade behavior and NULL safety
-- =====================================================

-- =====================================================
-- ISSUE #4: Fix CASCADE behavior on bar_products.global_product_id
-- Current: ON DELETE NO ACTION (creates orphaned bar_products)
-- Solution: ON DELETE SET NULL (bar_products become independent local products)
-- =====================================================

-- Drop existing FK constraint
ALTER TABLE bar_products
DROP CONSTRAINT IF EXISTS bar_products_global_product_id_fkey;

-- Recreate with ON DELETE SET NULL
ALTER TABLE bar_products
ADD CONSTRAINT bar_products_global_product_id_fkey
FOREIGN KEY (global_product_id)
REFERENCES global_products(id)
ON DELETE SET NULL
ON UPDATE CASCADE;

COMMENT ON CONSTRAINT bar_products_global_product_id_fkey ON bar_products IS
'FK with SET NULL: when global product deleted, bar products become independent local products';

-- =====================================================
-- ISSUE #10: Add NOT NULL constraints for data integrity
-- =====================================================

-- 1. Fix bar_categories.name - migrate NULL values first
-- Use unique names based on ID to avoid UNIQUE constraint violation on (bar_id, name)
UPDATE bar_categories
SET name = 'Sans nom ' || SUBSTRING(id::text FROM 1 FOR 8)
WHERE name IS NULL;

-- Add NOT NULL constraint
ALTER TABLE bar_categories
ALTER COLUMN name SET NOT NULL;

COMMENT ON COLUMN bar_categories.name IS 'Category name - required field (NOT NULL)';

-- 2. Fix global_products.created_by
-- Note: Cannot add NOT NULL constraint because:
-- - created_by has FK constraint to users.id
-- - No system user exists in users table
-- - NULL values represent products created by deleted users or legacy data
-- - Keeping nullable for flexibility, audit log uses fallback UUID for triggers

COMMENT ON COLUMN global_products.created_by IS 'Product creator user ID - nullable for legacy data and deleted users';

-- =====================================================
-- Verification queries (for documentation)
-- =====================================================

-- Verify FK constraint
-- SELECT constraint_name, delete_rule FROM information_schema.referential_constraints
-- WHERE constraint_name = 'bar_products_global_product_id_fkey';

-- Verify NOT NULL constraints
-- SELECT column_name, is_nullable FROM information_schema.columns
-- WHERE table_name = 'bar_categories' AND column_name = 'name'
-- UNION
-- SELECT column_name, is_nullable FROM information_schema.columns
-- WHERE table_name = 'global_products' AND column_name = 'created_by';
