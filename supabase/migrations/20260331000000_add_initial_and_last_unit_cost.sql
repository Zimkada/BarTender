-- Migration: Add initial_unit_cost and last_unit_cost to bar_products
-- Description:
--   initial_unit_cost: manually set cost for products without supply history (backfill, import, initial stock)
--   last_unit_cost: UX-only cache of most recent supply unit cost (NOT for accounting/analytics)
-- Author: Technical Team
-- Date: 2026-03-31

-- =====================================================
-- 1. Add columns to bar_products
-- =====================================================

ALTER TABLE bar_products
ADD COLUMN IF NOT EXISTS initial_unit_cost NUMERIC(12, 2) DEFAULT 0 CHECK (initial_unit_cost >= 0);

ALTER TABLE bar_products
ADD COLUMN IF NOT EXISTS last_unit_cost NUMERIC(12, 2) DEFAULT 0 CHECK (last_unit_cost >= 0);

COMMENT ON COLUMN bar_products.initial_unit_cost IS
  'Manually set cost per unit for products without supply history. Used as display fallback when no supply exists. Never overwritten by triggers.';

COMMENT ON COLUMN bar_products.last_unit_cost IS
  'UX-only cache: most recent supply unit cost. Updated by trigger on supplies INSERT. NOT for accounting — use current_average_cost (CUMP) for financial calculations.';

-- =====================================================
-- 2. Backfill last_unit_cost from existing supplies
-- =====================================================

UPDATE bar_products bp
SET last_unit_cost = COALESCE(
  (
    SELECT sup.unit_cost
    FROM supplies sup
    WHERE sup.product_id = bp.id
    ORDER BY sup.created_at DESC
    LIMIT 1
  ),
  0
);

-- =====================================================
-- 3. Extend existing trigger to also update last_unit_cost
-- =====================================================

CREATE OR REPLACE FUNCTION update_product_current_average_cost()
RETURNS TRIGGER AS $$
BEGIN
  -- Update CUMP (existing logic)
  UPDATE bar_products
  SET current_average_cost = COALESCE(
    (
      SELECT SUM(sup.unit_cost::numeric * sup.quantity::numeric) / SUM(sup.quantity::numeric)
      FROM supplies sup
      WHERE sup.product_id = COALESCE(NEW.product_id, OLD.product_id)
        AND sup.created_at >= NOW() - INTERVAL '90 days'
    ),
    0
  ),
  -- Also update last_unit_cost with most recent supply
  last_unit_cost = COALESCE(
    (
      SELECT sup.unit_cost
      FROM supplies sup
      WHERE sup.product_id = COALESCE(NEW.product_id, OLD.product_id)
      ORDER BY sup.created_at DESC
      LIMIT 1
    ),
    0
  )
  WHERE id = COALESCE(NEW.product_id, OLD.product_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Documentation
-- =====================================================

COMMENT ON FUNCTION update_product_current_average_cost() IS
  'Recalculates bar_products.current_average_cost (CUMP) using weighted average of supplies from last 90 days, and updates last_unit_cost with the most recent supply unit cost. Triggered by INSERT/UPDATE/DELETE on supplies table.';
