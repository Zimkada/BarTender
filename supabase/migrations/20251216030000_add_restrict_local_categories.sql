-- =====================================================
-- MIGRATION 20251216030000: Add RESTRICT constraint on local categories
-- Date: 2025-12-16 03:00:00
-- Description: Prevent deletion of local categories that are used by bar products
-- =====================================================

-- Add a foreign key constraint from bar_products to bar_categories
-- This will prevent deletion of a category if products reference it
-- ON DELETE RESTRICT: Database will reject deletion of category if any product uses it

ALTER TABLE bar_products
ADD CONSTRAINT fk_bar_products_local_category
FOREIGN KEY (local_category_id) REFERENCES bar_categories(id) ON DELETE RESTRICT;

COMMENT ON CONSTRAINT fk_bar_products_local_category ON bar_products IS
'Prevent deletion of local categories that have products. Enforces referential integrity at DB level.';
