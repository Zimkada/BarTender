-- =====================================================
-- BAR AUDIT LOG - Phase 10.1
-- =====================================================
-- Date: 2026-01-12
-- Purpose: Track bar lifecycle changes (CREATE, SUSPEND, ACTIVATE, UPDATE, DELETE)
-- Context: Replaces ActingAs impersonation with proper admin oversight

BEGIN;

-- =====================================================
-- 1. CREATE BAR_AUDIT_LOG TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS bar_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action TEXT NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'SUSPEND', 'ACTIVATE', 'DELETE')),
  bar_id UUID NOT NULL,
  bar_name TEXT NOT NULL,

  -- Changed values
  old_values JSONB,
  new_values JSONB,

  -- Who did it
  modified_by UUID REFERENCES users(id) ON DELETE SET NULL,
  modified_by_name TEXT,

  -- When
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bar_audit_bar ON bar_audit_log(bar_id);
CREATE INDEX IF NOT EXISTS idx_bar_audit_action ON bar_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_bar_audit_created ON bar_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bar_audit_modified_by ON bar_audit_log(modified_by);

COMMENT ON TABLE bar_audit_log IS 'Audit trail for bar management - creation, suspension, activation, updates, deletion';

-- =====================================================
-- 2. TRIGGER FOR BARS TABLE
-- =====================================================

CREATE OR REPLACE FUNCTION audit_bar_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_action TEXT;
  v_modified_by_name TEXT;
BEGIN
  -- Determine action
  IF TG_OP = 'INSERT' THEN
    v_action := 'CREATE';
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'DELETE';
  ELSIF TG_OP = 'UPDATE' THEN
    -- Detect specific state changes
    IF OLD.is_active = TRUE AND NEW.is_active = FALSE THEN
      v_action := 'SUSPEND';
    ELSIF OLD.is_active = FALSE AND NEW.is_active = TRUE THEN
      v_action := 'ACTIVATE';
    ELSE
      v_action := 'UPDATE';
    END IF;
  END IF;

  -- Get modifier name
  SELECT name INTO v_modified_by_name FROM users WHERE id = auth.uid() LIMIT 1;

  -- Insert audit log
  INSERT INTO bar_audit_log (
    action,
    bar_id,
    bar_name,
    old_values,
    new_values,
    modified_by,
    modified_by_name
  )
  VALUES (
    v_action,
    COALESCE(NEW.id, OLD.id),
    COALESCE(NEW.name, OLD.name),
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE jsonb_build_object(
      'name', OLD.name,
      'address', OLD.address,
      'phone', OLD.phone,
      'is_active', OLD.is_active,
      'closing_hour', OLD.closing_hour,
      'settings', OLD.settings
    ) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE jsonb_build_object(
      'name', NEW.name,
      'address', NEW.address,
      'phone', NEW.phone,
      'is_active', NEW.is_active,
      'closing_hour', NEW.closing_hour,
      'settings', NEW.settings
    ) END,
    auth.uid(),
    v_modified_by_name
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_audit_bar_changes ON bars;

CREATE TRIGGER trg_audit_bar_changes
AFTER INSERT OR UPDATE OR DELETE ON bars
FOR EACH ROW
EXECUTE FUNCTION audit_bar_changes();

-- =====================================================
-- 3. ENABLE RLS AND ADD POLICIES
-- =====================================================

ALTER TABLE bar_audit_log ENABLE ROW LEVEL SECURITY;

-- Only super_admins can view bar audit logs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'bar_audit_log' AND policyname = 'Super admins can view bar audit logs'
  ) THEN
    CREATE POLICY "Super admins can view bar audit logs"
    ON bar_audit_log FOR SELECT
    USING (is_super_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'bar_audit_log' AND policyname = 'System can create bar audit logs'
  ) THEN
    CREATE POLICY "System can create bar audit logs"
    ON bar_audit_log FOR INSERT
    WITH CHECK (true);
  END IF;
END $$;

-- =====================================================
-- 4. GRANT PERMISSIONS
-- =====================================================

GRANT SELECT, INSERT ON bar_audit_log TO authenticated;

-- =====================================================
-- 5. VERIFICATION
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '
    ╔════════════════════════════════════════════════════════════╗
    ║              BAR AUDIT LOG - Phase 10.1                    ║
    ╚════════════════════════════════════════════════════════════╝

    ✅ Created bar_audit_log table
    ✅ Created audit_bar_changes() trigger function
    ✅ Attached trigger to bars table
    ✅ Enabled RLS with super_admin-only read policy
    ✅ Granted permissions to authenticated users

    Tracked actions:
    • CREATE - New bar created
    • UPDATE - Bar details modified
    • SUSPEND - Bar marked as inactive
    • ACTIVATE - Bar reactivated
    • DELETE - Bar deleted (rare)

    All changes logged with:
    - Who: modified_by (user_id) + modified_by_name
    - What: old_values & new_values (JSONB)
    - When: created_at (timestamptz)
    ';
END $$;

COMMIT;
