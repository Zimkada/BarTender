-- Migration: Create trigger to sync bar_members.role changes to auth.users.app_metadata
-- Purpose: Automatically keep app_metadata.role in sync whenever bar_members role changes

BEGIN;

-- Create function to sync role changes
CREATE OR REPLACE FUNCTION sync_bar_member_role_to_auth_metadata()
RETURNS TRIGGER AS $$
BEGIN
  -- When a bar_member role is inserted or updated
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE auth.users
    SET raw_app_meta_data =
      CASE
        WHEN raw_app_meta_data IS NULL THEN
          jsonb_build_object('role', NEW.role)
        ELSE
          raw_app_meta_data || jsonb_build_object('role', NEW.role)
      END,
      updated_at = NOW()
    WHERE id = NEW.user_id;

    RAISE NOTICE 'Updated auth.users % with role % from bar_members', NEW.user_id, NEW.role;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on bar_members
DROP TRIGGER IF EXISTS trigger_sync_role_to_auth_metadata ON bar_members;

CREATE TRIGGER trigger_sync_role_to_auth_metadata
AFTER INSERT ON bar_members
FOR EACH ROW
EXECUTE FUNCTION sync_bar_member_role_to_auth_metadata();

-- Also sync when role is updated
CREATE TRIGGER trigger_sync_role_update_to_auth_metadata
AFTER UPDATE OF role ON bar_members
FOR EACH ROW
WHEN (OLD.role IS DISTINCT FROM NEW.role)
EXECUTE FUNCTION sync_bar_member_role_to_auth_metadata();

COMMIT;
