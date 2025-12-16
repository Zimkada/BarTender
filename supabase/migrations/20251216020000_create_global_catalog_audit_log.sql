-- =====================================================
-- MIGRATION 20251216020000: Create global catalog audit log
-- Date: 2025-12-16 02:00:00
-- Description: Add audit logging for global products and categories modifications
-- =====================================================

-- Create audit log table for tracking all modifications to global catalog
CREATE TABLE global_catalog_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action TEXT NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE')),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('PRODUCT', 'CATEGORY')),
  entity_id UUID NOT NULL,
  entity_name TEXT,

  -- Changed values (JSONB for flexibility)
  old_values JSONB,
  new_values JSONB,

  -- Who did it
  modified_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,

  -- When
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  COMMENT ON CONSTRAINT global_catalog_audit_log_action_check IS 'Only CREATE, UPDATE, DELETE actions'
);

-- Indexes for efficient querying
CREATE INDEX idx_global_catalog_audit_entity ON global_catalog_audit_log(entity_type, entity_id);
CREATE INDEX idx_global_catalog_audit_created ON global_catalog_audit_log(created_at DESC);
CREATE INDEX idx_global_catalog_audit_user ON global_catalog_audit_log(modified_by);

COMMENT ON TABLE global_catalog_audit_log IS 'Audit trail for all global catalog modifications - used for compliance and debugging';
COMMENT ON COLUMN global_catalog_audit_log.action IS 'Type of modification: CREATE (new), UPDATE (changed), DELETE (removed)';
COMMENT ON COLUMN global_catalog_audit_log.entity_type IS 'What was modified: PRODUCT or CATEGORY';
COMMENT ON COLUMN global_catalog_audit_log.old_values IS 'Previous values before modification (null for CREATE)';
COMMENT ON COLUMN global_catalog_audit_log.new_values IS 'New values after modification (null for DELETE)';

-- =====================================================
-- TRIGGERS FOR AUTOMATIC AUDIT LOGGING
-- =====================================================

-- Trigger for global_products modifications
CREATE OR REPLACE FUNCTION audit_global_products()
RETURNS TRIGGER AS $$
BEGIN
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
      COALESCE(NEW.created_by, auth.uid())
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
        auth.uid()
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
      auth.uid()
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

-- Trigger for global_categories modifications
CREATE OR REPLACE FUNCTION audit_global_categories()
RETURNS TRIGGER AS $$
BEGIN
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
      auth.uid()
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
        auth.uid()
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
      auth.uid()
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

-- =====================================================
-- RLS POLICIES for audit log (Super admin only can view)
-- =====================================================

ALTER TABLE global_catalog_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view audit log"
ON global_catalog_audit_log FOR SELECT
TO authenticated
USING (is_super_admin());

COMMENT ON POLICY "Super admins can view audit log" ON global_catalog_audit_log IS
'Only super_admin users can view the global catalog audit log for compliance and debugging';
