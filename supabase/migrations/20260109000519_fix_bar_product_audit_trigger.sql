-- =====================================================
-- FIX: Correct bar_product_audit_log trigger field references
-- =====================================================
-- Issue: Migration 20260109000511 has bug where trigger tries to access NEW.name
--        but bar_products table has local_name column, not name
--        Result: All bar_products INSERT/UPDATE/DELETE operations fail
--
-- Error: "record 'new' has no field 'name'"
--
-- Solution: Recreate trigger with correct column names (local_name instead of name)
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
      NEW.global_product_id,
      NEW.local_name,
      jsonb_build_object(
        'local_name', NEW.local_name,
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
        NEW.global_product_id,
        NEW.local_name,
        jsonb_build_object(
          'local_name', OLD.local_name,
          'price', OLD.price,
          'stock', OLD.stock,
          'is_active', OLD.is_active
        ),
        jsonb_build_object(
          'local_name', NEW.local_name,
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
      OLD.global_product_id,
      OLD.local_name,
      jsonb_build_object(
        'local_name', OLD.local_name,
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
  ║  FIXED: bar_product_audit_log Trigger                      ║
  ╚════════════════════════════════════════════════════════════╝

  ✅ Changed NEW.name → NEW.local_name (correct column)
  ✅ Changed OLD.name → OLD.local_name (correct column)
  ✅ Updated JSONB objects to use local_name key
  ✅ Trigger will now work on bar_products INSERT/UPDATE/DELETE

  What Was Broken:
  • Line 166: NEW.name → should be NEW.local_name
  • Line 168: ''name'' key → should be ''local_name''
  • Line 182: NEW.name → should be NEW.local_name
  • Line 202: OLD.name → should be OLD.local_name

  Affected Operations:
  ✓ Creating bar_products (was broken, now fixed)
  ✓ Updating bar_products (was broken, now fixed)
  ✓ Deleting bar_products (was broken, now fixed)

  Next Steps:
  1. Deploy this migration
  2. Test: Create/modify/delete a bar_product
  3. Verify no "record has no field name" errors
  ';
END $$;

COMMIT;
