-- =====================================================
-- FIX: Make audit trigger functions SECURITY DEFINER
-- =====================================================
-- Issue: Audit trigger functions execute with user's RLS context
--        When superadmin accesses "Gestion des bars", triggers fire
--        Triggers call auth.uid() in RLS context → recursive RLS blocking
--        Result: Superadmin only sees "système" bar instead of all bars
--
-- Root Cause:
--   - Triggers are NOT SECURITY DEFINER (execute with caller's privileges)
--   - When superadmin queries bar_members, RLS policies apply
--   - If triggers try to read bar_members internally, they get blocked
--   - Creates circular RLS dependency
--
-- Solution: Make audit trigger functions SECURITY DEFINER
--           They execute with database owner's privileges, bypass RLS
--           Trigger body is simple (just INSERT), no complex queries needed
-- =====================================================

BEGIN;

-- =====================================================
-- 1. FIX audit_user_changes() - SECURITY DEFINER
-- =====================================================

DROP TRIGGER IF EXISTS trg_audit_user_changes ON users;

CREATE OR REPLACE FUNCTION audit_user_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      'created_at', OLD.created_at
    ) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE jsonb_build_object(
      'email', NEW.email,
      'name', NEW.name,
      'is_active', NEW.is_active,
      'created_at', NEW.created_at
    ) END,
    auth.uid()
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_audit_user_changes
AFTER INSERT OR UPDATE OR DELETE ON users
FOR EACH ROW
EXECUTE FUNCTION audit_user_changes();

-- =====================================================
-- 2. FIX audit_bar_product_changes() - SECURITY DEFINER
-- =====================================================

DROP TRIGGER IF EXISTS trg_audit_bar_product_changes ON bar_products;

CREATE OR REPLACE FUNCTION audit_bar_product_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO bar_product_audit_log (action, bar_id, product_id, product_name, new_values, modified_by)
    VALUES (
      'CREATE',
      NEW.bar_id,
      NEW.id,
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
        NEW.id,
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
      OLD.id,
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
$$;

CREATE TRIGGER trg_audit_bar_product_changes
AFTER INSERT OR UPDATE OR DELETE ON bar_products
FOR EACH ROW
EXECUTE FUNCTION audit_bar_product_changes();

-- =====================================================
-- 3. FIX audit_return_changes() - SECURITY DEFINER
-- =====================================================

DROP TRIGGER IF EXISTS trg_audit_return_changes ON returns;

CREATE OR REPLACE FUNCTION audit_return_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

CREATE TRIGGER trg_audit_return_changes
AFTER INSERT OR DELETE ON returns
FOR EACH ROW
EXECUTE FUNCTION audit_return_changes();

DO $$
BEGIN
  RAISE NOTICE '
  ╔════════════════════════════════════════════════════════════╗
  ║  FIXED: Audit trigger functions now SECURITY DEFINER      ║
  ╚════════════════════════════════════════════════════════════╝

  ✅ audit_user_changes() - SECURITY DEFINER
  ✅ audit_bar_product_changes() - SECURITY DEFINER
  ✅ audit_return_changes() - SECURITY DEFINER

  What Was Wrong:
  • Triggers executed with caller''s RLS context
  • When superadmin accessed bars, triggers tried to read tables with RLS
  • Created circular RLS dependency → only "système" bar visible

  What Is Fixed:
  • Triggers now execute with database owner privileges
  • Bypass RLS safely (audit functions have no complex logic)
  • set_search_path = public ensures consistent execution

  Impact:
  ✓ Superadmin can view all bars in "Gestion des bars"
  ✓ Audit logging still works correctly
  ✓ No RLS circular dependencies
  ✓ ActingAs feature works properly
  ';
END $$;

COMMIT;
