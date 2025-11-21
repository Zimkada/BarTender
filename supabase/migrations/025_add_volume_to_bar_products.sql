-- =====================================================
-- MIGRATION 025: Add Volume Column to Bar Products
-- Date: 21 Novembre 2025
-- =====================================================

-- 1. Add volume column to bar_products
ALTER TABLE bar_products 
ADD COLUMN IF NOT EXISTS volume TEXT;

-- 2. Update comment
COMMENT ON COLUMN bar_products.volume IS 'Volume/Contenance du produit (ex: 33cl, 1L) - utile pour les produits custom';

-- 3. Reload schema cache
NOTIFY pgrst, 'reload schema';
