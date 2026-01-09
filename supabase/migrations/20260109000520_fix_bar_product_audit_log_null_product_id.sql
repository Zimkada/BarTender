-- =====================================================
-- FIX: bar_product_audit_log NULL product_id constraint violation
-- =====================================================
-- Issue: Migration 519 inserts NEW.global_product_id into product_id column
--        But bar_products.global_product_id is NULLABLE (for custom products)
--        Result: Constraint violation: "product_id" cannot be null
--
-- Root Cause:
--   - bar_products.id = the bar-specific product ID (ALWAYS exists)
--   - bar_products.global_product_id = optional link to global catalog (CAN BE NULL)
--   - Trigger was incorrectly using global_product_id instead of id
--
-- Solution: Use NEW.id (the bar_product.id) instead of NEW.global_product_id
-- =====================================================

BEGIN;

DROP TRIGGER IF EXISTS trg_audit_bar_product_changes ON bar_products;

CREATE OR REPLACE FUNCTION audit_bar_product_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO bar_product_audit_log (action, bar_id, product_id, product_name, new_values, modified_by)
    VALUES (
      'CREATE',
      NEW.bar_id,
      NEW.id,  -- Use bar_product.id, not global_product_id (which can be NULL)
      NEW.local_name,
      jsonb_build_object(
        'local_name', NEW.local_name,
        'global_product_id', NEW.global_product_id,
        'price', NEW.price,
        'stock', NEW.stock,
        'is_active', NEW.is_active
      ),
      auth.uid()
    );
  ELSIF TG_OP = 'UPDATE' THEN
    IF ROW(OLD.*) IS DISTINCT FROM ROW(NEW.*) THEN
      INSERT INTO bar_product_audit_log (action, bar_id, product_id, product_name, old_values, new_values, modified_by)
      VALUES (
        'UPDATE',
        NEW.bar_id,
        NEW.id,  -- Use bar_product.id, not global_product_id (which can be NULL)
        NEW.local_name,
        jsonb_build_object(
          'local_name', OLD.local_name,
          'global_product_id', OLD.global_product_id,
          'price', OLD.price,
          'stock', OLD.stock,
          'is_active', OLD.is_active
        ),
        jsonb_build_object(
          'local_name', NEW.local_name,
          'global_product_id', NEW.global_product_id,
          'price', NEW.price,
          'stock', NEW.stock,
          'is_active', NEW.is_active
        ),
        auth.uid()
      );
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO bar_product_audit_log (action, bar_id, product_id, product_name, old_values, modified_by)
    VALUES (
      'DELETE',
      OLD.bar_id,
      OLD.id,  -- Use bar_product.id, not global_product_id (which can be NULL)
      OLD.local_name,
      jsonb_build_object(
        'local_name', OLD.local_name,
        'global_product_id', OLD.global_product_id,
        'price', OLD.price,
        'stock', OLD.stock,
        'is_active', OLD.is_active
      ),
      auth.uid()
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_bar_product_changes
AFTER INSERT OR UPDATE OR DELETE ON bar_products
FOR EACH ROW
EXECUTE FUNCTION audit_bar_product_changes();

DO $$
BEGIN
  RAISE NOTICE '
  ╔════════════════════════════════════════════════════════════╗
  ║  FIXED: bar_product_audit_log NULL product_id violation    ║
  ╚════════════════════════════════════════════════════════════╝

  ✅ Changed product_id value: global_product_id → id
  ✅ Now uses bar_products.id (always non-null)
  ✅ Added global_product_id to JSONB for reference
  ✅ Constraint violation resolved

  What Was Wrong:
  • bar_products.global_product_id is NULLABLE (custom products have NULL)
  • Trigger was inserting global_product_id into NOT NULL product_id column
  • Result: Constraint violation when creating custom products

  What Is Fixed:
  • Now uses bar_products.id (unique, always exists)
  • global_product_id tracked in JSONB for reference
  • Works for both global catalog products AND custom bar-specific products

  All Operations Now Work:
  ✓ Creating bar_products (global and custom)
  ✓ Updating bar_products
  ✓ Deleting bar_products
  ✓ Audit trail captures all changes
  ';
END $$;

COMMIT;
