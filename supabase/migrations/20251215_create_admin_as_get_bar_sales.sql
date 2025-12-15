-- Function to allow SuperAdmin to view sales "as" another user (or just view bar sales via proxy)
-- This is used by the ProxyAdminService.getBarSalesAsProxy method

CREATE OR REPLACE FUNCTION public.admin_as_get_bar_sales(
    p_acting_as_user_id UUID,
    p_bar_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id UUID;
    v_is_super_admin BOOLEAN;
BEGIN
    -- 1. Verify Caller is Super Admin
    v_caller_id := auth.uid();

    -- Check role in bar_members
    SELECT EXISTS (
        SELECT 1 FROM public.bar_members
        WHERE user_id = v_caller_id
        AND role = 'super_admin'
        AND is_active = true
    ) INTO v_is_super_admin;

    IF NOT v_is_super_admin THEN
        RAISE EXCEPTION 'Access Denied: Only Super Admins can use this proxy function.';
    END IF;

    -- 2. Fetch Sales for the specified bar
    -- JOIN NOT needed for simple JSON construction unless we select columns from joined tables, which we do.
    -- To sort inside jsonb_agg, we use ORDER BY inside the aggregate function.
    RETURN (
        SELECT COALESCE(jsonb_agg(
            to_jsonb(s) || jsonb_build_object(
                'seller_name', u.name,
                'validator_name', v.name,
                'items', COALESCE(s.items, '[]'::jsonb) -- Ensure items is array
            )
            ORDER BY s.business_date DESC
        ), '[]'::jsonb)
        FROM public.sales s
        LEFT JOIN public.users u ON s.sold_by = u.id
        LEFT JOIN public.users v ON s.validated_by = v.id
        WHERE s.bar_id = p_bar_id
    );
END;
$$;

-- Grant execute permission to authenticated users (RLS logic inside handles the check)
GRANT EXECUTE ON FUNCTION public.admin_as_get_bar_sales(UUID, UUID) TO authenticated;


-- Function to allow SuperAdmin to view sales stats "as" another user
-- This is used by the ProxyAdminService.getSalesStatsAsProxy method

CREATE OR REPLACE FUNCTION public.admin_as_get_sales_stats(
    p_acting_as_user_id UUID,
    p_bar_id UUID,
    p_start_date TEXT DEFAULT NULL,
    p_end_date TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id UUID;
    v_is_super_admin BOOLEAN;
    v_total_sales BIGINT;
    v_total_revenue NUMERIC;
    v_refunds_total NUMERIC;
    v_net_revenue NUMERIC;
    v_pending_sales BIGINT;
    v_average_sale NUMERIC;
BEGIN
    -- 1. Verify Caller is Super Admin
    v_caller_id := auth.uid();

    -- Check role in bar_members
    SELECT EXISTS (
        SELECT 1 FROM public.bar_members
        WHERE user_id = v_caller_id
        AND role = 'super_admin'
        AND is_active = true
    ) INTO v_is_super_admin;

    IF NOT v_is_super_admin THEN
        RAISE EXCEPTION 'Access Denied: Only Super Admins can use this proxy function.';
    END IF;

    -- 2. Calculate Sales Stats
    
    -- Validated Sales Revenue & Count
    SELECT 
        COALESCE(SUM(total), 0),
        COUNT(*)
    INTO 
        v_total_revenue,
        v_total_sales
    FROM public.sales
    WHERE bar_id = p_bar_id
      AND status = 'validated'
      AND (p_start_date IS NULL OR business_date >= p_start_date::DATE)
      AND (p_end_date IS NULL OR business_date <= p_end_date::DATE);

    -- Pending Sales Count
    SELECT COUNT(*)
    INTO v_pending_sales
    FROM public.sales
    WHERE bar_id = p_bar_id
      AND status = 'pending';

    -- Average Sale
    IF v_total_sales > 0 THEN
        v_average_sale := v_total_revenue / v_total_sales;
    ELSE
        v_average_sale := 0;
    END IF;

    -- 3. Calculate Returns Stats (Refunds)
    SELECT COALESCE(SUM(refund_amount), 0)
    INTO v_refunds_total
    FROM public.returns
    WHERE bar_id = p_bar_id
      AND is_refunded = true
      AND (status = 'approved' OR status = 'restocked')
      AND (p_start_date IS NULL OR business_date >= p_start_date::DATE)
      AND (p_end_date IS NULL OR business_date <= p_end_date::DATE);

    -- 4. Calculate Net Revenue
    v_net_revenue := v_total_revenue - v_refunds_total;

    RETURN jsonb_build_object(
        'totalSales', v_total_sales,
        'grossRevenue', v_total_revenue,
        'totalRevenue', v_total_revenue, -- Keep totalRevenue for compatibility
        'refundsTotal', v_refunds_total,
        'netRevenue', v_net_revenue,
        'pendingSales', v_pending_sales,
        'averageSale', v_average_sale
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_as_get_sales_stats(UUID, UUID, TEXT, TEXT) TO authenticated;
