-- =====================================================
-- MIGRATION 20251216010000: Add RESTRICT constraint on global_products.category
-- Date: 2025-12-16 01:00:00
-- Description: Prevent deletion of categories that are used by global_products
-- =====================================================

-- Add a foreign key constraint from global_products to global_categories
-- This will prevent deletion of a category if products reference it
-- ON DELETE RESTRICT: Database will reject deletion of category if any product uses it

ALTER TABLE global_products
ADD CONSTRAINT fk_global_products_category
FOREIGN KEY (category) REFERENCES global_categories(name) ON DELETE RESTRICT;

COMMENT ON CONSTRAINT fk_global_products_category ON global_products IS
'Prevent deletion of categories that have products. Enforces referential integrity at DB level.';
