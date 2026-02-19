-- Migration: 20251215_admin_impersonation_extensions.sql
-- Description: Extensions pour le mode "Acting As" (Support SuperAdmin) et fix Analytics

-- ==============================================================================
-- 1. UTILS & PERMISSIONS
-- ==============================================================================

-- Helper pour vérifier si l'utilisateur est un SuperAdmin (déjà existant mais rappel)
-- On assume que p_acting_user_id est l'ID du SuperAdmin qui fait l'action

-- ==============================================================================
-- 2. MANAGEMENT RPCs (Back-office Extensions)
-- ==============================================================================

-- 2.1 SETTINGS : Modifier les paramètres du bar
CREATE OR REPLACE FUNCTION admin_as_update_bar_settings(
    p_acting_user_id UUID,
    p_bar_id UUID,
    p_settings JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_old_settings JSONB;
BEGIN
    -- 1. Vérification SuperAdmin
    PERFORM authorize_admin_proxy(p_acting_user_id);

    -- 2. Récupérer les anciens settings pour le log
    SELECT settings INTO v_old_settings FROM bars WHERE id = p_bar_id;

    -- 3. Mise à jour
    UPDATE bars
    SET settings = p_settings,
        updated_at = NOW()
    WHERE id = p_bar_id;

    -- 4. Log
    PERFORM internal_log_audit_event(
        p_bar_id,
        'BAR_SETTINGS_UPDATE',
        p_acting_user_id,
        jsonb_build_object(
            'old_settings', v_old_settings,
            'new_settings', p_settings,
            'action_type', 'proxy_admin'
        )
    );

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 2.2 TEAM : Gérer les membres (Ajouter/Modifier/Supprimer)
CREATE OR REPLACE FUNCTION admin_as_manage_team_member(
    p_acting_user_id UUID,
    p_bar_id UUID,
    p_target_user_id UUID, -- L'utilisateur cible (membre)
    p_action TEXT, -- 'ADD', 'UPDATE_ROLE', 'REMOVE'
    p_role TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL -- Pour l'ajout par email si besoin (complexe via RPC, on gère souvent user creation séparément)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_member_record RECORD;
BEGIN
    -- 1. Vérification SuperAdmin
    PERFORM authorize_admin_proxy(p_acting_user_id);

    -- 2. Action
    IF p_action = 'REMOVE' THEN
        DELETE FROM bar_members
        WHERE bar_id = p_bar_id AND user_id = p_target_user_id;

        PERFORM internal_log_audit_event(
            p_bar_id,
            'MEMBER_REMOVED',
            p_acting_user_id,
            jsonb_build_object('target_user_id', p_target_user_id, 'action_type', 'proxy_admin')
        );

    ELSIF p_action = 'UPDATE_ROLE' THEN
        UPDATE bar_members
        SET role = p_role,
            updated_at = NOW()
        WHERE bar_id = p_bar_id AND user_id = p_target_user_id;

         PERFORM internal_log_audit_event(
            p_bar_id,
            'MEMBER_ROLE_UPDATED',
            p_acting_user_id,
            jsonb_build_object('target_user_id', p_target_user_id, 'new_role', p_role, 'action_type', 'proxy_admin')
        );
    
    ELSIF p_action = 'ADD' THEN
        -- Note: L'ajout implique généralement que l'invite existe déjà ou via un flow d'invite.
        -- Ici on assume que l'association directe member <-> bar suffit si le user existe.
        INSERT INTO bar_members (bar_id, user_id, role, is_active)
        VALUES (p_bar_id, p_target_user_id, p_role, true)
        ON CONFLICT (bar_id, user_id) WHERE user_id IS NOT NULL
        DO UPDATE SET role = p_role, is_active = true, updated_at = NOW();

        PERFORM internal_log_audit_event(
            p_bar_id,
            'MEMBER_ADDED',
            p_acting_user_id,
            jsonb_build_object('target_user_id', p_target_user_id, 'role', p_role, 'action_type', 'proxy_admin')
        );
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 2.3 CATALOG : Gérer Produits (Create/Update)
CREATE OR REPLACE FUNCTION admin_as_manage_product(
    p_acting_user_id UUID,
    p_bar_id UUID,
    p_product_data JSONB, -- Contient id, name, price, category_id, etc.
    p_action TEXT -- 'CREATE', 'UPDATE', 'DELETE'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_product_id UUID;
    v_result JSONB;
BEGIN
    PERFORM authorize_admin_proxy(p_acting_user_id);

    IF p_action = 'CREATE' THEN
        INSERT INTO products (
            bar_id, 
            category_id, 
            name, 
            description, 
            price, 
            volume, 
            is_active
        )
        VALUES (
            p_bar_id,
            (p_product_data->>'category_id')::uuid,
            p_product_data->>'name',
            p_product_data->>'description',
            (p_product_data->>'price')::numeric,
            p_product_data->>'volume',
            COALESCE((p_product_data->>'is_active')::boolean, true)
        )
        RETURNING id INTO v_product_id;

        PERFORM internal_log_audit_event(p_bar_id, 'PRODUCT_CREATED', p_acting_user_id, jsonb_build_object('product_id', v_product_id, 'name', p_product_data->>'name', 'action_type', 'proxy_admin'));
        v_result := jsonb_build_object('id', v_product_id);

    ELSIF p_action = 'UPDATE' THEN
        v_product_id := (p_product_data->>'id')::uuid;
        
        UPDATE products
        SET category_id = COALESCE((p_product_data->>'category_id')::uuid, category_id),
            name = COALESCE(p_product_data->>'name', name),
            description = COALESCE(p_product_data->>'description', description),
            price = COALESCE((p_product_data->>'price')::numeric, price),
            volume = COALESCE(p_product_data->>'volume', volume),
            is_active = COALESCE((p_product_data->>'is_active')::boolean, is_active),
            updated_at = NOW()
        WHERE id = v_product_id AND bar_id = p_bar_id;

        PERFORM internal_log_audit_event(p_bar_id, 'PRODUCT_UPDATED', p_acting_user_id, jsonb_build_object('product_id', v_product_id, 'changes', p_product_data, 'action_type', 'proxy_admin'));
        v_result := jsonb_build_object('id', v_product_id);

    ELSIF p_action = 'DELETE' THEN
         v_product_id := (p_product_data->>'id')::uuid;
         -- Soft delete usually preferred, but if DELETE requested:
         -- We often just set is_active = false instead of delete to keep history
         UPDATE products SET is_active = false WHERE id = v_product_id AND bar_id = p_bar_id;
         PERFORM internal_log_audit_event(p_bar_id, 'PRODUCT_ARCHIVED', p_acting_user_id, jsonb_build_object('product_id', v_product_id, 'action_type', 'proxy_admin'));
         v_result := jsonb_build_object('success', true);
    END IF;

    RETURN v_result;
END;
$$;

-- 2.4 SUPPLIES : Gérer Réappro (Créer entrée stock + update stock)
CREATE OR REPLACE FUNCTION admin_as_create_supply(
    p_acting_user_id UUID,
    p_bar_id UUID,
    p_supply_data JSONB -- { items: [{product_id, quantity, cost, supplier}], date, etc }
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_item JSONB;
    v_product_id UUID;
    v_quantity INTEGER;
    v_cost NUMERIC;
    v_supplier TEXT;
BEGIN
    PERFORM authorize_admin_proxy(p_acting_user_id);

    -- Pour chaque item dans le supply
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_supply_data->'items')
    LOOP
        v_product_id := (v_item->>'product_id')::uuid;
        v_quantity := (v_item->>'quantity')::integer;
        v_cost := (v_item->>'cost')::numeric;
        v_supplier := v_item->>'supplier';

        -- 1. Créer enregistrement supply (simplifié, si table supplies existe, sinon juste stock update)
        -- On suppose qu'il y a une table 'supplies' ou 'stock_movements'
        -- Si table 'supplies' existe:
        INSERT INTO supplies (bar_id, product_id, quantity, cost_price, supplier, created_by, created_at)
        VALUES (p_bar_id, v_product_id, v_quantity, v_cost, v_supplier, p_acting_user_id, NOW());

        -- 2. Update Stock
        UPDATE bar_products
        SET stock = stock + v_quantity,
            updated_at = NOW()
        WHERE bar_id = p_bar_id AND product_id = v_product_id;

    END LOOP;

    PERFORM internal_log_audit_event(p_bar_id, 'SUPPLY_CREATED', p_acting_user_id, jsonb_build_object('items_count', jsonb_array_length(p_supply_data->'items'), 'action_type', 'proxy_admin'));
    
    RETURN jsonb_build_object('success', true);
END;
$$;


-- 2.5 PROMOTIONS : Create/Update
CREATE OR REPLACE FUNCTION admin_as_manage_promotion(
    p_acting_user_id UUID,
    p_bar_id UUID,
    p_promo_data JSONB,
    p_action TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_promo_id UUID;
BEGIN
    PERFORM authorize_admin_proxy(p_acting_user_id);

    IF p_action = 'CREATE' THEN
        INSERT INTO promotions (
            bar_id, 
            name, 
            description, 
            start_date, 
            end_date, 
            discount_type, 
            discount_value, 
            conditions,
            is_active
        )
        VALUES (
            p_bar_id,
            p_promo_data->>'name',
            p_promo_data->>'description',
            (p_promo_data->>'start_date')::timestamptz,
            (p_promo_data->>'end_date')::timestamptz,
            p_promo_data->>'discount_type',
            (p_promo_data->>'discount_value')::numeric,
            p_promo_data->'conditions',
            COALESCE((p_promo_data->>'is_active')::boolean, true)
        ) RETURNING id INTO v_promo_id;
        
        PERFORM internal_log_audit_event(p_bar_id, 'PROMOTION_CREATED', p_acting_user_id, jsonb_build_object('promo_id', v_promo_id, 'name', p_promo_data->>'name', 'action_type', 'proxy_admin'));

    ELSIF p_action = 'UPDATE' THEN
        v_promo_id := (p_promo_data->>'id')::uuid;
        UPDATE promotions
        SET name = COALESCE(p_promo_data->>'name', name),
            description = COALESCE(p_promo_data->>'description', description),
            start_date = COALESCE((p_promo_data->>'start_date')::timestamptz, start_date),
            end_date = COALESCE((p_promo_data->>'end_date')::timestamptz, end_date),
            discount_type = COALESCE(p_promo_data->>'discount_type', discount_type),
            discount_value = COALESCE((p_promo_data->>'discount_value')::numeric, discount_value),
            conditions = COALESCE(p_promo_data->'conditions', conditions),
            is_active = COALESCE((p_promo_data->>'is_active')::boolean, is_active),
            updated_at = NOW()
        WHERE id = v_promo_id;

        PERFORM internal_log_audit_event(p_bar_id, 'PROMOTION_UPDATED', p_acting_user_id, jsonb_build_object('promo_id', v_promo_id, 'action_type', 'proxy_admin'));

    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;


-- ==============================================================================
-- 3. ANALYTICS FIX (Top Products Access)
-- ==============================================================================

CREATE OR REPLACE FUNCTION admin_as_get_top_products(
    p_acting_user_id UUID,
    p_bar_id UUID,
    p_start_date TIMESTAMP,
    p_end_date TIMESTAMP,
    p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
    product_name TEXT,
    product_volume TEXT,
    total_quantity BIGINT,
    total_revenue NUMERIC,
    avg_unit_price NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 1. Check permissions
    PERFORM authorize_admin_proxy(p_acting_user_id);

    -- 2. Query Directly from Materialized View (Bypassing View RLS)
    -- We can read from top_products_by_period_mat directly since we are inside a SECURITY DEFINER function
    RETURN QUERY
    SELECT 
        m.product_name,
        m.product_volume,
        SUM(m.total_quantity)::BIGINT as total_quantity, -- Re-aggregate sum in case multiple days selected
        SUM(m.total_revenue)::NUMERIC as total_revenue,
        AVG(m.avg_unit_price)::NUMERIC as avg_unit_price
    FROM top_products_by_period_mat m
    WHERE m.bar_id = p_bar_id
      AND m.sale_date >= p_start_date
      AND m.sale_date <= p_end_date
    GROUP BY m.product_name, m.product_volume
    ORDER BY total_quantity DESC
    LIMIT p_limit;
END;
$$;
