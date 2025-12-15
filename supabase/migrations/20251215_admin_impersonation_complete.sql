-- Migration: Admin Impersonation Complete
-- Date: 15 Dec 2025
-- Description: Complete suite of RPC functions for Super Admin impersonation ("Acting As"), including Audit Logs.

-- ==============================================================================
-- 1. Helper Function: is_super_admin()
-- We reuse the existing public.is_super_admin() based on bar_members.
-- This block ensures we have consistent Access Control logic.
-- ==============================================================================

-- ==============================================================================
-- 2. READ RPCs (No Audit Log for performance, unless critical)
-- ==============================================================================

-- 2.1 Get Bar Products as Proxy
DROP FUNCTION IF EXISTS admin_as_get_bar_products(UUID, UUID);

CREATE OR REPLACE FUNCTION admin_as_get_bar_products(
    p_acting_user_id UUID,
    p_bar_id UUID
)
RETURNS SETOF bar_products
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 1. Verify Caller is Super Admin
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Access Denied: Only Super Admins can use this proxy function.';
    END IF;

    -- 2. Return Data
    RETURN QUERY
    SELECT *
    FROM bar_products
    WHERE bar_id = p_bar_id
    ORDER BY local_name ASC;
END;
$$;

COMMENT ON FUNCTION admin_as_get_bar_products IS 'Proxy: Super Admin acts as a user to view products of a bar.';

-- 2.2 Get Bar Members as Proxy
DROP FUNCTION IF EXISTS admin_as_get_bar_members(UUID, UUID);

CREATE OR REPLACE FUNCTION admin_as_get_bar_members(
    p_acting_user_id UUID,
    p_bar_id UUID
)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    bar_id UUID,
    role TEXT,
    is_active BOOLEAN,
    user_data JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 1. Verify Caller is Super Admin
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Access Denied: Only Super Admins can use this proxy function.';
    END IF;

    -- 2. Return Data
    RETURN QUERY
    SELECT 
        bm.id,
        bm.user_id,
        bm.bar_id,
        bm.role,
        bm.is_active,
        jsonb_build_object(
            'id', u.id,
            'name', u.name,
            'email', u.username, -- username used as email/identifier
            'phone', u.phone,
            'avatar_url', u.avatar_url
        ) as user_data
    FROM bar_members bm
    JOIN users u ON bm.user_id = u.id
    WHERE bm.bar_id = p_bar_id
    ORDER BY u.name ASC;
END;
$$;

COMMENT ON FUNCTION admin_as_get_bar_members IS 'Proxy: Super Admin acts as a user to view members.';

-- ==============================================================================
-- 3. WRITE RPCs (WITH Audit Logs)
-- ==============================================================================

-- 3.1 Create Sale as Proxy
-- Wraps create_sale_with_promotions
DROP FUNCTION IF EXISTS admin_as_create_sale(UUID, UUID, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, DATE);

CREATE OR REPLACE FUNCTION admin_as_create_sale(
    p_acting_user_id UUID,
    p_bar_id UUID,
    p_items JSONB,
    p_payment_method TEXT,
    p_status TEXT DEFAULT 'pending',
    p_customer_name TEXT DEFAULT NULL,
    p_customer_phone TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_business_date DATE DEFAULT NULL
)
RETURNS sales
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_sale sales;
    v_caller_id UUID := auth.uid(); -- The actual Super Admin ID
BEGIN
    -- 1. Verify Caller is Super Admin
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Access Denied: Only Super Admins can use this proxy function.';
    END IF;

    -- 2. Call the standard creation function (impersonating via parameters)
    -- We pass p_acting_user_id as p_sold_by, which sets created_by
    SELECT * INTO v_new_sale
    FROM create_sale_with_promotions(
        p_bar_id,
        p_items,
        p_payment_method,
        p_acting_user_id, -- Sold By (Acting User)
        p_status,
        p_customer_name,
        p_customer_phone,
        p_notes,
        p_business_date
    );

    -- 3. Audit Log
    INSERT INTO audit_logs (
        event,
        severity,
        user_id,
        user_name,
        user_role,
        bar_id,
        description,
        metadata,
        related_entity_id,
        related_entity_type
    ) VALUES (
        'PROXY_ACTION_SALE_CREATED',
        'warning', -- Warning because it's an impersonated action
        v_caller_id, -- Actual Super Admin
        (SELECT name FROM users WHERE id = v_caller_id),
        'super_admin',
        p_bar_id,
        'Super Admin created sale acting as ' || (SELECT name FROM users WHERE id = p_acting_user_id),
        jsonb_build_object(
            'acting_as_user_id', p_acting_user_id,
            'sale_total', v_new_sale.total,
            'item_count', jsonb_array_length(p_items)
        ),
        v_new_sale.id,
        'sale'
    );

    RETURN v_new_sale;
END;
$$;

-- 3.2 Update Stock as Proxy
DROP FUNCTION IF EXISTS admin_as_update_stock(UUID, UUID, UUID, INTEGER, TEXT);

CREATE OR REPLACE FUNCTION admin_as_update_stock(
    p_acting_user_id UUID,
    p_bar_id UUID,
    p_product_id UUID,
    p_quantity_delta INTEGER,
    p_reason TEXT
)
RETURNS bar_products
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_updated_product bar_products;
    v_caller_id UUID := auth.uid();
BEGIN
    -- 1. Verify Caller is Super Admin
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Access Denied: Only Super Admins can use this proxy function.';
    END IF;

    -- 2. Update Stock
    UPDATE bar_products
    SET stock = stock + p_quantity_delta,
        updated_at = NOW()
    WHERE id = p_product_id
    AND bar_id = p_bar_id
    RETURNING * INTO v_updated_product;

    IF v_updated_product IS NULL THEN
        RAISE EXCEPTION 'Product not found or not in this bar';
    END IF;

    -- 3. Audit Log
    INSERT INTO audit_logs (
        event,
        severity,
        user_id,
        user_name,
        user_role,
        bar_id,
        description,
        metadata,
        related_entity_id,
        related_entity_type
    ) VALUES (
        'PROXY_ACTION_STOCK_UPDATE',
        'warning',
        v_caller_id,
        (SELECT name FROM users WHERE id = v_caller_id),
        'super_admin',
        p_bar_id,
        'Super Admin updated stock acting as ' || (SELECT name FROM users WHERE id = p_acting_user_id),
        jsonb_build_object(
            'acting_as_user_id', p_acting_user_id,
            'product_name', v_updated_product.local_name,
            'quantity_delta', p_quantity_delta,
            'reason', p_reason,
            'new_stock', v_updated_product.stock
        ),
        p_product_id,
        'product'
    );

    RETURN v_updated_product;
END;
$$;
