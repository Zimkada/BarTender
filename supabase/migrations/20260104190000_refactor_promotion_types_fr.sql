-- MIGRATION: Refactoriser les types de promotions en français
-- DATE: 2026-01-04 19:00
-- OBJECTIF: Ajouter les nouveaux types français et les deux nouveaux types par unité

-- =====================================================
-- ÉTAPE 1: Ajouter TOUS les nouveaux types à l'enum
-- =====================================================
-- Les nouveaux types français pour renommer les anciens
ALTER TYPE promotion_type ADD VALUE IF NOT EXISTS 'reduction_vente';
ALTER TYPE promotion_type ADD VALUE IF NOT EXISTS 'pourcentage';
ALTER TYPE promotion_type ADD VALUE IF NOT EXISTS 'prix_special';
ALTER TYPE promotion_type ADD VALUE IF NOT EXISTS 'lot';

-- Les nouveaux types pour gestion des réductions/majorations par unité
ALTER TYPE promotion_type ADD VALUE IF NOT EXISTS 'reduction_produit';
ALTER TYPE promotion_type ADD VALUE IF NOT EXISTS 'majoration_produit';

-- =====================================================
-- ÉTAPE 2: Mettre à jour les promotions existantes
-- =====================================================
-- Renommer les types anglais vers les français
-- NOTE: Ces UPDATE doivent être dans une transaction séparée après l'ALTER TYPE

BEGIN;

UPDATE public.promotions
SET type = 'reduction_vente'::promotion_type
WHERE type = 'fixed_discount'::promotion_type;

UPDATE public.promotions
SET type = 'pourcentage'::promotion_type
WHERE type = 'percentage'::promotion_type;

UPDATE public.promotions
SET type = 'prix_special'::promotion_type
WHERE type = 'special_price'::promotion_type;

UPDATE public.promotions
SET type = 'lot'::promotion_type
WHERE type = 'bundle'::promotion_type;

-- =====================================================
-- ÉTAPE 3: Vérification
-- =====================================================
-- Les promotions ont été mises à jour
SELECT id, name, type, created_at
FROM public.promotions
ORDER BY created_at DESC;

COMMIT;
