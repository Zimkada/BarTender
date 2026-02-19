-- =====================================================
-- MIGRATION: Force Physical Stock Constraint
-- Date: 2026-02-18
-- Description: Ensures stock cannot go below zero at the database level.
-- =====================================================

-- ⚠️ ATTENTION : Si vous avez déjà des stocks négatifs, cette migration échouera.
-- Vous devez d'abord nettoyer vos données :
-- UPDATE bar_products SET stock = 0 WHERE stock < 0;

DO $$
BEGIN
    -- 1. Tenter d'ajouter la contrainte
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'stock_physique_positif'
    ) THEN
        ALTER TABLE bar_products 
        ADD CONSTRAINT stock_physique_positif CHECK (stock >= 0);
        
        RAISE NOTICE 'Contrainte de stock ajoutée avec succès.';
    ELSE
        RAISE NOTICE 'La contrainte existe déjà.';
    END IF;
EXCEPTION
    WHEN check_violation THEN
        RAISE EXCEPTION 'Impossible d''ajouter la contrainte : des produits ont un stock négatif. Veuillez les corriger manuellement d''abord.';
END $$;

-- 2. Notification pour rafraîchir le cache PostgREST
NOTIFY pgrst, 'reload schema';
