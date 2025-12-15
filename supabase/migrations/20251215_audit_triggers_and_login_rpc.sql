-- Migration: Enable Audit Triggers and Login Logging
-- Date: 15 Dec 2025
-- Description: Automates audit logging for key business actions and enables login tracking.

-- ==============================================================================
-- 1. Helper Function: Log Audit Event (Internal)
-- ==============================================================================
CREATE OR REPLACE FUNCTION internal_log_audit_event(
    p_event TEXT,
    p_severity TEXT,
    p_user_id UUID,
    p_bar_id UUID,
    p_description TEXT,
    p_metadata JSONB,
    p_related_entity_id UUID,
    p_related_entity_type TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_name TEXT;
    v_user_role TEXT;
    v_bar_name TEXT;
BEGIN
    -- Get User Info
    SELECT name INTO v_user_name FROM users WHERE id = p_user_id;

    -- Get Role (Best effort)
    IF p_bar_id IS NOT NULL THEN
        SELECT role INTO v_user_role FROM bar_members WHERE user_id = p_user_id AND bar_id = p_bar_id;
    END IF;
    
    -- Fallback role if not found (e.g. system usage)
    IF v_user_role IS NULL THEN
        v_user_role := 'user';
    END IF;

    -- Get Bar Name
    IF p_bar_id IS NOT NULL THEN
        SELECT name INTO v_bar_name FROM bars WHERE id = p_bar_id;
    END IF;

    INSERT INTO audit_logs (
        event,
        severity,
        user_id,
        user_name,
        user_role,
        bar_id,
        bar_name,
        description,
        metadata,
        related_entity_id,
        related_entity_type
    ) VALUES (
        p_event,
        p_severity,
        p_user_id,
        COALESCE(v_user_name, 'Unknown'),
        v_user_role,
        p_bar_id,
        v_bar_name,
        p_description,
        p_metadata,
        p_related_entity_id,
        p_related_entity_type
    );
END;
$$;

-- ==============================================================================
-- 2. Login RPC (To be called by Frontend)
-- ==============================================================================
CREATE OR REPLACE FUNCTION log_user_login()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN
        RETURN;
    END IF;

    -- Update Last Login in public.users
    UPDATE public.users 
    SET last_login_at = NOW() 
    WHERE id = v_user_id;

    -- Log to Audit
    PERFORM internal_log_audit_event(
        'USER_LOGIN',
        'info',
        v_user_id,
        NULL, -- No specific bar context for login usually, or could fetch primary
        'User logged in',
        jsonb_build_object('method', 'password'),
        v_user_id,
        'user'
    );
END;
$$;

-- ==============================================================================
-- 3. Trigger: Sales Creation
-- ==============================================================================
CREATE OR REPLACE FUNCTION trigger_audit_sale_creation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    PERFORM internal_log_audit_event(
        'SALE_CREATED',
        'info',
        NEW.created_by,
        NEW.bar_id,
        'Sale created with total: ' || NEW.total,
        jsonb_build_object('total', NEW.total, 'items_count', jsonb_array_length(NEW.items)),
        NEW.id,
        'sale'
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_sale_creation ON sales;
CREATE TRIGGER trg_audit_sale_creation
    AFTER INSERT ON sales
    FOR EACH ROW
    EXECUTE FUNCTION trigger_audit_sale_creation();

-- ==============================================================================
-- 4. Trigger: Stock Updates (Manual or Sale)
-- ==============================================================================
CREATE OR REPLACE FUNCTION trigger_audit_stock_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Only log significant changes or manual updates? 
    -- For now, log all stock changes to have full traceability.
    IF OLD.stock != NEW.stock THEN
        PERFORM internal_log_audit_event(
            'STOCK_UPDATE',
            'info',
            auth.uid(), -- Might be null if system trigger? No, usually triggered by user action.
            NEW.bar_id,
            'Stock changed for ' || COALESCE(NEW.local_name, 'Product'),
            jsonb_build_object(
                'product_id', NEW.id, 
                'old_stock', OLD.stock, 
                'new_stock', NEW.stock,
                'delta', NEW.stock - OLD.stock
            ),
            NEW.id,
            'product'
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_stock_update ON bar_products;
CREATE TRIGGER trg_audit_stock_update
    AFTER UPDATE OF stock ON bar_products
    FOR EACH ROW
    EXECUTE FUNCTION trigger_audit_stock_update();

-- ==============================================================================
-- 5. Trigger: Member Changes
-- ==============================================================================
CREATE OR REPLACE FUNCTION trigger_audit_member_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        PERFORM internal_log_audit_event(
            'MEMBER_ADDED',
            'warning',
            auth.uid(),
            NEW.bar_id,
            'New member added: ' || NEW.role,
            jsonb_build_object('member_user_id', NEW.user_id, 'role', NEW.role),
            NEW.id,
            'user'
        );
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        PERFORM internal_log_audit_event(
            'MEMBER_REMOVED',
            'warning',
            auth.uid(),
            OLD.bar_id,
            'Member removed',
            jsonb_build_object('member_user_id', OLD.user_id),
            OLD.id,
            'user'
        );
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_member_change ON bar_members;
CREATE TRIGGER trg_audit_member_change
    AFTER INSERT OR DELETE ON bar_members
    FOR EACH ROW
    EXECUTE FUNCTION trigger_audit_member_change();
