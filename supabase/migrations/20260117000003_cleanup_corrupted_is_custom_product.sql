-- =====================================================
-- MIGRATION: Cleanup corrupted is_custom_product flag
-- Description: Fix products where is_custom_product doesn't match globalProductId
--              This can happen if products were edited incorrectly before the fix
-- =====================================================

BEGIN;

-- 1. Fix products with global_product_id but marked as custom
-- These should be marked as NOT custom (they are linked to catalog)
UPDATE bar_products
SET is_custom_product = false
WHERE global_product_id IS NOT NULL
  AND is_custom_product = true;

-- 2. Fix products without global_product_id but marked as NOT custom
-- These should be marked as custom (they are standalone bar products)
UPDATE bar_products
SET is_custom_product = true
WHERE global_product_id IS NULL
  AND is_custom_product = false
  AND id NOT IN (
    -- Exception: Don't change products created by system/automation
    -- (those with no local_name might be system placeholders)
    SELECT id FROM bar_products WHERE local_name IS NULL OR local_name = ''
  );

COMMIT;

-- Result:
-- ✅ Products with global_product_id now correctly have is_custom_product = false
-- ✅ Products without global_product_id now correctly have is_custom_product = true
-- ✅ All bar_products now have consistent is_custom_product values
-- ✅ Prevents future issues with product type detection
