-- MIGRATION: Remplir les coûts manquants dans promotion_applications
-- DATE: 2026-01-05 (Exécutée APRÈS 20260105_fix_promotion_profit_roi_calculation.sql)
-- OBJECTIF: Mettre à jour les données historiques avec les coûts réels des produits
-- NOTE: Cette migration ne fonctionne QUE si les colonnes product_cost_unit et product_cost_total existent

-- =====================================================
-- ÉTAPE 1: Remplir product_cost_unit et product_cost_total
-- =====================================================
-- Utiliser le coût moyen actuel du produit comme proxy historique
-- (Idéalement, on aurait besoin de stocker le coût historique au moment de la vente)

BEGIN;

-- Mettre à jour product_cost_unit avec le coût actuel du produit
UPDATE public.promotion_applications pa
SET product_cost_unit = COALESCE(bp.current_average_cost, 0),
    product_cost_total = COALESCE(bp.current_average_cost, 0) * pa.quantity_sold
FROM public.bar_products bp
WHERE pa.product_id = bp.id
  AND pa.bar_id = bp.bar_id
  AND (pa.product_cost_unit IS NULL OR pa.product_cost_unit = 0);

COMMIT;

-- Vérification: Voir combien de lignes ont été mises à jour
SELECT
    COUNT(*) as total_applications,
    COUNT(CASE WHEN product_cost_unit > 0 THEN 1 END) as with_costs,
    COUNT(CASE WHEN product_cost_unit = 0 THEN 1 END) as without_costs,
    COALESCE(AVG(product_cost_unit), 0) as avg_cost_per_unit,
    COALESCE(SUM(product_cost_total), 0) as total_cost_of_goods
FROM public.promotion_applications;
