-- Migration: Add current_average_cost to bar_products
-- Description: Store CUMP (Coût Unitaire Moyen Pondéré) for accurate profit calculations
-- Author: Technical Team
-- Date: 2025-12-18

-- =====================================================
-- Add current_average_cost column
-- =====================================================

ALTER TABLE bar_products
ADD COLUMN current_average_cost NUMERIC(12, 2) DEFAULT 0 CHECK (current_average_cost >= 0);

COMMENT ON COLUMN bar_products.current_average_cost IS
  'CUMP (Coût Unitaire Moyen Pondéré) - Updated when new supplies arrive. Used for accurate profit calculations.';

-- =====================================================
-- Create index for performance
-- =====================================================

CREATE INDEX idx_bar_products_avg_cost ON bar_products(bar_id, current_average_cost);

-- =====================================================
-- Initialize current_average_cost from existing supplies
-- =====================================================

UPDATE bar_products bp
SET current_average_cost = COALESCE(
  (
    SELECT SUM(sup.unit_cost::numeric * sup.quantity::numeric) / SUM(sup.quantity::numeric)
    FROM supplies sup
    WHERE sup.product_id = bp.id
      AND sup.created_at >= NOW() - INTERVAL '90 days'
  ),
  0
);

-- =====================================================
-- Grant permissions
-- =====================================================

GRANT UPDATE ON bar_products TO authenticated;
