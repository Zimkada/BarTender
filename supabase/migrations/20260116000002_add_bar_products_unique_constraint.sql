-- =====================================================
-- MIGRATION: Add UNIQUE constraint on bar_products
-- Description: Permet l'utilisation de upsert avec onConflict
--              sur (bar_id, global_product_id)
-- =====================================================

BEGIN;

-- 1. NETTOYAGE : Supprimer physiquement les doublons existants (bar_id, global_product_id)
-- On garde le plus récent pour chaque couple
WITH duplicates AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY bar_id, global_product_id
               ORDER BY created_at DESC
           ) as rn
    FROM bar_products
    WHERE global_product_id IS NOT NULL
)
DELETE FROM bar_products
WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

-- 2. AJOUT DE LA CONTRAINTE UNIQUE
-- Unicité pour les produits globaux (pas pour les produits custom locaux)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_bar_global_product
ON bar_products(bar_id, global_product_id)
WHERE global_product_id IS NOT NULL;

COMMIT;

-- Rapport d'exécution
DO $$
BEGIN
  RAISE NOTICE '✅ Contrainte UNIQUE ajoutée sur bar_products.';
  RAISE NOTICE '- Doublons supprimés (garde le plus récent pour chaque bar/produit).';
  RAISE NOTICE '- upsert(onConflict: "bar_id,global_product_id") est maintenant possible.';
END $$;
