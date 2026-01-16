-- =====================================================
-- MIGRATION: Add fields for catalog enrichment system
-- Description: Permet aux Super Admins d'enrichir
--              le catalogue global avec des produits
--              locaux provenant des bars
-- Date: 2026-01-16
-- =====================================================

BEGIN;

-- =====================================================
-- 1. GLOBAL_PRODUCTS : Métadonnées d'enrichissement
--    Traçabilité de la source locale
-- =====================================================

ALTER TABLE global_products
ADD COLUMN IF NOT EXISTS source_bar_id TEXT,
ADD COLUMN IF NOT EXISTS source_bar_product_id TEXT,
ADD COLUMN IF NOT EXISTS contributed_at TIMESTAMPTZ;

-- Commentaires pour documentation
COMMENT ON COLUMN global_products.source_bar_id
IS 'Bar d''origine si produit promu depuis un bar_product (métadonnée historique, pas de FK pour éviter contraintes rigides)';

COMMENT ON COLUMN global_products.source_bar_product_id
IS 'ID du bar_product source (métadonnée historique, pas de FK)';

COMMENT ON COLUMN global_products.contributed_at
IS 'Date de contribution au catalogue global par un bar';

-- Index pour recherche rapide des produits contribués par bar
CREATE INDEX IF NOT EXISTS idx_global_products_source_bar
ON global_products(source_bar_id)
WHERE source_bar_id IS NOT NULL;

-- =====================================================
-- 2. BAR_PRODUCTS : Flag pour identifier produits sources
--    d'enrichissements du catalogue global
-- =====================================================

ALTER TABLE bar_products
ADD COLUMN IF NOT EXISTS is_source_of_global BOOLEAN DEFAULT false;

COMMENT ON COLUMN bar_products.is_source_of_global
IS 'True si ce produit custom a été promu au catalogue global';

-- Index pour afficher rapidement les produits promus
CREATE INDEX IF NOT EXISTS idx_bar_products_source_global
ON bar_products(is_source_of_global)
WHERE is_source_of_global = true;

COMMIT;

-- =====================================================
-- Rapport d'exécution
-- =====================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Système d''enrichissement du catalogue installé:';
  RAISE NOTICE '- global_products: source_bar_id, source_bar_product_id, contributed_at';
  RAISE NOTICE '- bar_products: is_source_of_global (flag)';
  RAISE NOTICE '- Indexes créés pour performance';
  RAISE NOTICE '- Super Admins peuvent maintenant enrichir le catalogue global';
END $$;
