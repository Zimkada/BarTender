-- =====================================================
-- Migration: Add display_name to bar_products
-- Description: Add computed display_name column with automatic updates
-- Author: AI Assistant
-- Date: 2025-11-26
-- =====================================================

-- =====================================================
-- STEP 1: Create helper function to compute display name
-- =====================================================

CREATE OR REPLACE FUNCTION compute_bar_product_display_name(
  p_local_name TEXT,
  p_global_product_id UUID,
  p_is_custom_product BOOLEAN
)
RETURNS TEXT
LANGUAGE SQL
STABLE
AS $$
  SELECT COALESCE(
    -- Priority 1: Local name (custom override)
    p_local_name,
    -- Priority 2: Global product name
    (SELECT name FROM global_products WHERE id = p_global_product_id),
    -- Priority 3: Fallback for edge cases
    CASE 
      WHEN p_is_custom_product THEN 'Produit personnalisé'
      ELSE 'Produit sans nom'
    END
  );
$$;

COMMENT ON FUNCTION compute_bar_product_display_name IS 
  'Compute display name for a bar product using local_name, global product name, or fallback';

-- =====================================================
-- STEP 2: Add display_name column
-- =====================================================

ALTER TABLE bar_products 
ADD COLUMN IF NOT EXISTS display_name TEXT;

COMMENT ON COLUMN bar_products.display_name IS 
  'Computed display name: local_name > global_product.name > fallback';

-- =====================================================
-- STEP 3: Backfill existing rows
-- =====================================================

UPDATE bar_products
SET display_name = compute_bar_product_display_name(
  local_name,
  global_product_id,
  is_custom_product
)
WHERE display_name IS NULL;

-- =====================================================
-- STEP 4: Create trigger function to auto-update display_name
-- =====================================================

CREATE OR REPLACE FUNCTION sync_bar_product_display_name()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Compute and set display_name
  NEW.display_name := compute_bar_product_display_name(
    NEW.local_name,
    NEW.global_product_id,
    NEW.is_custom_product
  );
  
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION sync_bar_product_display_name IS 
  'Trigger function to automatically update display_name on INSERT/UPDATE';

-- =====================================================
-- STEP 5: Create trigger
-- =====================================================

DROP TRIGGER IF EXISTS update_bar_product_display_name ON bar_products;

CREATE TRIGGER update_bar_product_display_name
  BEFORE INSERT OR UPDATE OF local_name, global_product_id, is_custom_product
  ON bar_products
  FOR EACH ROW
  EXECUTE FUNCTION sync_bar_product_display_name();

COMMENT ON TRIGGER update_bar_product_display_name ON bar_products IS 
  'Auto-update display_name when local_name, global_product_id, or is_custom_product changes';

-- =====================================================
-- STEP 6: Add index for search performance
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_bar_products_display_name 
ON bar_products(display_name);

COMMENT ON INDEX idx_bar_products_display_name IS 
  'Index for fast product name searches';

-- =====================================================
-- STEP 7: Add NOT NULL constraint (after backfill)
-- =====================================================

-- Make display_name NOT NULL now that all rows have values
ALTER TABLE bar_products 
ALTER COLUMN display_name SET NOT NULL;

-- =====================================================
-- VERIFICATION QUERIES (for testing)
-- =====================================================

-- Verify all products have display_name
DO $$
DECLARE
  null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_count
  FROM bar_products
  WHERE display_name IS NULL;
  
  IF null_count > 0 THEN
    RAISE WARNING 'Found % products with NULL display_name', null_count;
  ELSE
    RAISE NOTICE 'All products have display_name ✓';
  END IF;
END $$;

-- Show sample of display names
DO $$
DECLARE
  sample_record RECORD;
BEGIN
  RAISE NOTICE 'Sample display names:';
  FOR sample_record IN 
    SELECT 
      id,
      local_name,
      display_name,
      is_custom_product
    FROM bar_products
    LIMIT 5
  LOOP
    RAISE NOTICE '  - %: local=%, display=%, custom=%', 
      sample_record.id, 
      sample_record.local_name, 
      sample_record.display_name,
      sample_record.is_custom_product;
  END LOOP;
END $$;
