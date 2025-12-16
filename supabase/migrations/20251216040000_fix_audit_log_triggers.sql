-- =====================================================
-- MIGRATION 20251216040000: Fix audit log triggers - null modified_by issue
-- Date: 2025-12-16 04:00:00
-- Description: Fix triggers to handle null auth.uid() in trigger context
-- =====================================================

-- Drop existing triggers that are failing
DROP TRIGGER IF EXISTS trg_audit_global_products ON global_products;
DROP TRIGGER IF EXISTS trg_audit_global_categories ON global_categories;

-- Drop existing functions
DROP FUNCTION IF EXISTS audit_global_products();
DROP FUNCTION IF EXISTS audit_global_categories();

-- =====================================================
-- FIXED: Trigger for global_products modifications
-- Solution: Use a default system UUID when auth.uid() is null
-- =====================================================
CREATE OR REPLACE FUNCTION audit_global_products()
RETURNS TRIGGER AS $$
DECLARE
  current_user_id UUID;
BEGIN
  -- Try to get current user, fallback to system user (all zeros)
  current_user_id := COALESCE(
    auth.uid(),
    NEW.created_by,
    '00000000-0000-0000-0000-000000000000'::uuid
  );

  IF TG_OP = 'INSERT' THEN
    INSERT INTO global_catalog_audit_log (action, entity_type, entity_id, entity_name, new_values, modified_by)
    VALUES (
      'CREATE',
      'PRODUCT',
      NEW.id,
      NEW.name,
      jsonb_build_object(
        'id', NEW.id,
        'name', NEW.name,
        'brand', NEW.brand,
        'volume', NEW.volume,
        'category', NEW.category,
        'barcode', NEW.barcode,
        'official_image', NEW.official_image
      ),
      current_user_id
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Only log if actual changes occurred
    IF ROW(OLD.*) IS DISTINCT FROM ROW(NEW.*) THEN
      INSERT INTO global_catalog_audit_log (action, entity_type, entity_id, entity_name, old_values, new_values, modified_by)
      VALUES (
        'UPDATE',
        'PRODUCT',
        NEW.id,
        NEW.name,
        jsonb_build_object(
          'name', OLD.name,
          'brand', OLD.brand,
          'volume', OLD.volume,
          'category', OLD.category,
          'barcode', OLD.barcode,
          'suggested_price_min', OLD.suggested_price_min,
          'suggested_price_max', OLD.suggested_price_max,
          'official_image', OLD.official_image
        ),
        jsonb_build_object(
          'name', NEW.name,
          'brand', NEW.brand,
          'volume', NEW.volume,
          'category', NEW.category,
          'barcode', NEW.barcode,
          'suggested_price_min', NEW.suggested_price_min,
          'suggested_price_max', NEW.suggested_price_max,
          'official_image', NEW.official_image
        ),
        current_user_id
      );
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO global_catalog_audit_log (action, entity_type, entity_id, entity_name, old_values, modified_by)
    VALUES (
      'DELETE',
      'PRODUCT',
      OLD.id,
      OLD.name,
      jsonb_build_object(
        'id', OLD.id,
        'name', OLD.name,
        'brand', OLD.brand,
        'volume', OLD.volume,
        'category', OLD.category,
        'barcode', OLD.barcode
      ),
      current_user_id
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_audit_global_products
AFTER INSERT OR UPDATE OR DELETE ON global_products
FOR EACH ROW
EXECUTE FUNCTION audit_global_products();

-- =====================================================
-- FIXED: Trigger for global_categories modifications
-- =====================================================
CREATE OR REPLACE FUNCTION audit_global_categories()
RETURNS TRIGGER AS $$
DECLARE
  current_user_id UUID;
BEGIN
  -- Try to get current user, fallback to system user (all zeros)
  current_user_id := COALESCE(
    auth.uid(),
    '00000000-0000-0000-0000-000000000000'::uuid
  );

  IF TG_OP = 'INSERT' THEN
    INSERT INTO global_catalog_audit_log (action, entity_type, entity_id, entity_name, new_values, modified_by)
    VALUES (
      'CREATE',
      'CATEGORY',
      NEW.id,
      NEW.name,
      jsonb_build_object(
        'id', NEW.id,
        'name', NEW.name,
        'color', NEW.color,
        'icon', NEW.icon,
        'order_index', NEW.order_index
      ),
      current_user_id
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF ROW(OLD.*) IS DISTINCT FROM ROW(NEW.*) THEN
      INSERT INTO global_catalog_audit_log (action, entity_type, entity_id, entity_name, old_values, new_values, modified_by)
      VALUES (
        'UPDATE',
        'CATEGORY',
        NEW.id,
        NEW.name,
        jsonb_build_object(
          'name', OLD.name,
          'color', OLD.color,
          'icon', OLD.icon,
          'order_index', OLD.order_index
        ),
        jsonb_build_object(
          'name', NEW.name,
          'color', NEW.color,
          'icon', NEW.icon,
          'order_index', NEW.order_index
        ),
        current_user_id
      );
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO global_catalog_audit_log (action, entity_type, entity_id, entity_name, old_values, modified_by)
    VALUES (
      'DELETE',
      'CATEGORY',
      OLD.id,
      OLD.name,
      jsonb_build_object(
        'id', OLD.id,
        'name', OLD.name,
        'color', OLD.color,
        'icon', OLD.icon
      ),
      current_user_id
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_audit_global_categories
AFTER INSERT OR UPDATE OR DELETE ON global_categories
FOR EACH ROW
EXECUTE FUNCTION audit_global_categories();

COMMENT ON FUNCTION audit_global_products IS 'Fixed: Uses fallback UUID (all zeros) when auth.uid() is null in trigger context';
COMMENT ON FUNCTION audit_global_categories IS 'Fixed: Uses fallback UUID (all zeros) when auth.uid() is null in trigger context';
