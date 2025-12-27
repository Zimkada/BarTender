-- Migration: Indexes stratégiques pour optimisation performance
-- Description: Indexes partiels et composites pour requêtes critiques
-- Compatibilité: Supabase Free + Pro

-- Stock (requêtes fréquentes avec filtrage actif)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bar_products_bar_stock 
ON bar_products(bar_id, stock) 
WHERE is_active = true;

-- Ventes (filtrage business_date pour analytics)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_bar_business_date 
ON sales(bar_id, business_date DESC) 
WHERE status = 'validated';

-- Ventes (filtrage created_at pour agrégats temps réel)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_bar_created_at 
ON sales(bar_id, created_at DESC) 
WHERE status = 'validated';

-- Retours (jointure sale_id pour calculs)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_returns_sale_product 
ON returns(sale_id, product_id) 
WHERE status IN ('approved', 'restocked');

-- Produits globaux (recherche par catégorie)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_global_products_category 
ON global_products(category_id) 
WHERE is_active = true;

-- Commentaires
COMMENT ON INDEX idx_bar_products_bar_stock IS 'Optimise requêtes stock par bar (produits actifs uniquement)';
COMMENT ON INDEX idx_sales_bar_business_date IS 'Optimise analytics ventes par business_date';
COMMENT ON INDEX idx_sales_bar_created_at IS 'Optimise agrégats temps réel (bar_activity)';
COMMENT ON INDEX idx_returns_sale_product IS 'Optimise jointures retours-ventes';
COMMENT ON INDEX idx_global_products_category IS 'Optimise filtrage produits par catégorie';
