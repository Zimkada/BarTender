-- Migration: Add trigger to update current_average_cost when supplies are added/updated
-- Description: Automatically recalculate CUMP when new supplies arrive or stock changes
-- Author: Technical Team
-- Date: 2025-12-18

-- =====================================================
-- Function: Update product's current_average_cost
-- =====================================================

CREATE OR REPLACE FUNCTION update_product_current_average_cost()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the product's current_average_cost whenever supplies table changes
  UPDATE bar_products
  SET current_average_cost = COALESCE(
    (
      SELECT SUM(sup.unit_cost::numeric * sup.quantity::numeric) / SUM(sup.quantity::numeric)
      FROM supplies sup
      WHERE sup.product_id = COALESCE(NEW.product_id, OLD.product_id)
        AND sup.created_at >= NOW() - INTERVAL '90 days'
    ),
    0
  )
  WHERE id = COALESCE(NEW.product_id, OLD.product_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Trigger: After INSERT on supplies
-- =====================================================

DROP TRIGGER IF EXISTS trg_supplies_after_insert ON supplies;
CREATE TRIGGER trg_supplies_after_insert
AFTER INSERT ON supplies
FOR EACH ROW
EXECUTE FUNCTION update_product_current_average_cost();

-- =====================================================
-- Trigger: After UPDATE on supplies (if unit_cost changes)
-- =====================================================

DROP TRIGGER IF EXISTS trg_supplies_after_update ON supplies;

CREATE TRIGGER trg_supplies_after_update
AFTER UPDATE ON supplies
FOR EACH ROW
WHEN (OLD.unit_cost IS DISTINCT FROM NEW.unit_cost OR OLD.quantity IS DISTINCT FROM NEW.quantity)
EXECUTE FUNCTION update_product_current_average_cost();

-- =====================================================
-- Trigger: After DELETE on supplies
-- =====================================================

DROP TRIGGER IF EXISTS trg_supplies_after_delete ON supplies;

CREATE TRIGGER trg_supplies_after_delete
AFTER DELETE ON supplies
FOR EACH ROW
EXECUTE FUNCTION update_product_current_average_cost();

-- =====================================================
-- Documentation
-- =====================================================

COMMENT ON FUNCTION update_product_current_average_cost() IS
  'Recalculates bar_products.current_average_cost (CUMP) using weighted average of supplies from last 90 days. Triggered by INSERT/UPDATE/DELETE on supplies table.';

COMMENT ON TRIGGER trg_supplies_after_insert ON supplies IS
  'Updates product CUMP when new supply is added';

COMMENT ON TRIGGER trg_supplies_after_update ON supplies IS
  'Updates product CUMP when supply unit_cost or quantity changes';

COMMENT ON TRIGGER trg_supplies_after_delete ON supplies IS
  'Updates product CUMP when supply is deleted (restocks, corrections, etc.)';
