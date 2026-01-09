-- =====================================================
-- AUDIT LOGGING: Users, Bar Products, and Returns
-- =====================================================
-- Date: 2026-01-09
-- Purpose: Track creation, modification, deletion of critical entities
-- Compliance: GDPR, financial audit, fraud detection

BEGIN;

-- =====================================================
-- 1. CREATE USER_AUDIT_LOG TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS user_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action TEXT NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'DEACTIVATE', 'REACTIVATE')),
  user_id UUID NOT NULL,
  user_email TEXT,
  user_name TEXT,

  -- Changed values
  old_values JSONB,
  new_values JSONB,

  -- Who did it (admin who made the change)
  modified_by UUID REFERENCES users(id) ON DELETE SET NULL,

  -- When
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_audit_user ON user_audit_log(user_id);
CREATE INDEX idx_user_audit_action ON user_audit_log(action);
CREATE INDEX idx_user_audit_created ON user_audit_log(created_at DESC);
CREATE INDEX idx_user_audit_modified_by ON user_audit_log(modified_by);

COMMENT ON TABLE user_audit_log IS 'Audit trail for user account changes - creation, modification, deactivation';

-- =====================================================
-- 2. CREATE BAR_PRODUCT_AUDIT_LOG TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS bar_product_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action TEXT NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE')),
  entity_type TEXT NOT NULL DEFAULT 'PRODUCT' CHECK (entity_type IN ('PRODUCT')),
  bar_id UUID NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  product_id UUID NOT NULL,
  product_name TEXT,

  -- Changed values
  old_values JSONB,
  new_values JSONB,

  -- Who did it
  modified_by UUID REFERENCES users(id) ON DELETE SET NULL,

  -- When
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bar_product_audit_bar ON bar_product_audit_log(bar_id);
CREATE INDEX idx_bar_product_audit_product ON bar_product_audit_log(product_id);
CREATE INDEX idx_bar_product_audit_action ON bar_product_audit_log(action);
CREATE INDEX idx_bar_product_audit_created ON bar_product_audit_log(created_at DESC);

COMMENT ON TABLE bar_product_audit_log IS 'Audit trail for bar-specific product changes (price, stock, visibility)';

-- =====================================================
-- 3. CREATE RETURN_AUDIT_LOG TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS return_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action TEXT NOT NULL CHECK (action IN ('CREATE', 'CANCEL')),
  return_id UUID NOT NULL,
  sale_id UUID,
  bar_id UUID,

  -- Return details
  reason TEXT,
  refund_amount DECIMAL(10,2),

  -- Who did it
  modified_by UUID REFERENCES users(id) ON DELETE SET NULL,

  -- When
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_return_audit_return ON return_audit_log(return_id);
CREATE INDEX idx_return_audit_sale ON return_audit_log(sale_id);
CREATE INDEX idx_return_audit_bar ON return_audit_log(bar_id);
CREATE INDEX idx_return_audit_created ON return_audit_log(created_at DESC);

COMMENT ON TABLE return_audit_log IS 'Audit trail for returns/refunds - when created and cancelled';

-- =====================================================
-- 4. TRIGGER FOR USERS TABLE
-- =====================================================

CREATE OR REPLACE FUNCTION audit_user_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_action TEXT;
BEGIN
  -- Determine action
  IF TG_OP = 'INSERT' THEN
    v_action := 'CREATE';
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'DELETE';
  ELSE
    -- UPDATE - check if just is_active flag changed
    IF OLD.is_active != NEW.is_active THEN
      v_action := CASE WHEN NEW.is_active THEN 'REACTIVATE' ELSE 'DEACTIVATE' END;
    ELSE
      v_action := 'UPDATE';
    END IF;
  END IF;

  INSERT INTO user_audit_log (action, user_id, user_email, user_name, old_values, new_values, modified_by)
  VALUES (
    v_action,
    COALESCE(NEW.id, OLD.id),
    COALESCE(NEW.email, OLD.email),
    COALESCE(NEW.name, OLD.name),
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE jsonb_build_object(
      'email', OLD.email,
      'name', OLD.name,
      'is_active', OLD.is_active,
      'role', OLD.role,
      'created_at', OLD.created_at
    ) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE jsonb_build_object(
      'email', NEW.email,
      'name', NEW.name,
      'is_active', NEW.is_active,
      'role', NEW.role,
      'created_at', NEW.created_at
    ) END,
    auth.uid()
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_user_changes ON users;

CREATE TRIGGER trg_audit_user_changes
AFTER INSERT OR UPDATE OR DELETE ON users
FOR EACH ROW
EXECUTE FUNCTION audit_user_changes();

-- =====================================================
-- 5. TRIGGER FOR BAR_PRODUCTS TABLE
-- =====================================================

CREATE OR REPLACE FUNCTION audit_bar_product_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO bar_product_audit_log (action, bar_id, product_id, product_name, new_values, modified_by)
    VALUES (
      'CREATE',
      NEW.bar_id,
      NEW.global_product_id,
      NEW.name,
      jsonb_build_object(
        'name', NEW.name,
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
        NEW.name,
        jsonb_build_object(
          'price', OLD.price,
          'stock', OLD.stock,
          'is_active', OLD.is_active
        ),
        jsonb_build_object(
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
      OLD.name,
      jsonb_build_object(
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

DROP TRIGGER IF EXISTS trg_audit_bar_product_changes ON bar_products;

CREATE TRIGGER trg_audit_bar_product_changes
AFTER INSERT OR UPDATE OR DELETE ON bar_products
FOR EACH ROW
EXECUTE FUNCTION audit_bar_product_changes();

-- =====================================================
-- 6. TRIGGER FOR RETURNS TABLE
-- =====================================================

CREATE OR REPLACE FUNCTION audit_return_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO return_audit_log (action, return_id, sale_id, bar_id, reason, refund_amount, modified_by)
    VALUES (
      'CREATE',
      NEW.id,
      NEW.sale_id,
      (SELECT bar_id FROM sales WHERE id = NEW.sale_id),
      NEW.reason,
      NEW.refund_amount,
      auth.uid()
    );
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO return_audit_log (action, return_id, sale_id, bar_id, reason, refund_amount, modified_by)
    VALUES (
      'CANCEL',
      OLD.id,
      OLD.sale_id,
      (SELECT bar_id FROM sales WHERE id = OLD.sale_id),
      OLD.reason,
      OLD.refund_amount,
      auth.uid()
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_return_changes ON returns;

CREATE TRIGGER trg_audit_return_changes
AFTER INSERT OR DELETE ON returns
FOR EACH ROW
EXECUTE FUNCTION audit_return_changes();

-- =====================================================
-- 7. ENABLE RLS AND ADD POLICIES
-- =====================================================

ALTER TABLE user_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE bar_product_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_audit_log ENABLE ROW LEVEL SECURITY;

-- Only super_admins can view these audit logs
CREATE POLICY "Super admins can view user audit logs"
ON user_audit_log FOR SELECT
USING (is_super_admin());

CREATE POLICY "System can create user audit logs"
ON user_audit_log FOR INSERT
WITH CHECK (true);

CREATE POLICY "Super admins can view bar product audit logs"
ON bar_product_audit_log FOR SELECT
USING (is_super_admin());

CREATE POLICY "System can create bar product audit logs"
ON bar_product_audit_log FOR INSERT
WITH CHECK (true);

CREATE POLICY "Super admins can view return audit logs"
ON return_audit_log FOR SELECT
USING (is_super_admin());

CREATE POLICY "System can create return audit logs"
ON return_audit_log FOR INSERT
WITH CHECK (true);

-- =====================================================
-- 8. GRANT PERMISSIONS
-- =====================================================

GRANT SELECT, INSERT ON user_audit_log TO authenticated;
GRANT SELECT, INSERT ON bar_product_audit_log TO authenticated;
GRANT SELECT, INSERT ON return_audit_log TO authenticated;

-- =====================================================
-- 9. VERIFICATION
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '
    ╔════════════════════════════════════════════════════════════╗
    ║      AUDIT LOGGING EXPANDED - Users, Products, Returns     ║
    ╚════════════════════════════════════════════════════════════╝

    ✅ Created user_audit_log table
    ✅ Created bar_product_audit_log table
    ✅ Created return_audit_log table

    ✅ Created trigger for users (CREATE, UPDATE, DELETE, DEACTIVATE, REACTIVATE)
    ✅ Created trigger for bar_products (CREATE, UPDATE, DELETE)
    ✅ Created trigger for returns (CREATE, CANCEL)

    ✅ Enabled RLS on all audit tables
    ✅ Added super_admin-only read policies
    ✅ Added system insert policies

    Audit coverage now includes:
    • User account lifecycle (creation, modifications, deactivation)
    • Bar product management (pricing, stock, availability)
    • Returns/refunds (when created and cancelled)
    • Impersonation (already tracked in audit_logs)
    • Sales & stock changes (already tracked in audit_logs)

    All changes are automatically logged with:
    - WHO made the change (modified_by user_id)
    - WHAT changed (old_values, new_values)
    - WHEN it happened (created_at timestamp)
    - WHY (for returns, reason is captured)
    ';
END $$;

COMMIT;
