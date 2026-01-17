-- =====================================================
-- MIGRATION: Fix UNIQUE constraint on bar_products
-- Description: Allow re-adding deleted global products
-- by removing the global constraint and using application-level control
-- =====================================================

BEGIN;

-- 1. Drop the existing UNIQUE constraint that prevents re-adding deleted products
ALTER TABLE bar_products
DROP CONSTRAINT IF EXISTS bar_products_unique_global_product;

-- 2. Drop the old UNIQUE INDEX without WHERE clause (from 20260116000002)
-- This index was blocking re-additions of soft-deleted products
DROP INDEX IF EXISTS idx_unique_bar_global_product;

-- 3. Drop any existing triggers that might interfere
DROP TRIGGER IF EXISTS trg_unique_active_global_product ON bar_products;
DROP FUNCTION IF EXISTS check_unique_active_global_product();

-- 4. Create partial unique index (only on active products)
-- This ensures no duplicate ACTIVE products but allows multiple inactive rows
CREATE UNIQUE INDEX IF NOT EXISTS idx_bar_products_unique_active
ON bar_products(bar_id, global_product_id)
WHERE is_active = true AND global_product_id IS NOT NULL;

COMMIT;

-- Result:
-- ✅ Drops idx_unique_bar_global_product (global UNIQUE index blocking re-additions)
-- ✅ Drops bar_products_unique_global_product constraint (if exists)
-- ✅ Users can now re-add previously deleted global products
-- ✅ Database prevents duplicate ACTIVE global products via partial index
-- ✅ Soft-deleted products don't block re-additions
-- ✅ Multiple inactive rows allowed, only 1 active per (bar, global_product)
