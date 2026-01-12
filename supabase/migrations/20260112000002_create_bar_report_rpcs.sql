-- =====================================================
-- BAR REPORT & AUDIT RPCs - Phase 10.2 & 10.3
-- =====================================================
-- Date: 2026-01-12
-- Purpose: Admin functions to generate bar reports and view audit logs

BEGIN;

-- =====================================================
-- 1. RPC: Generate Bar Report (Phase 10.2)
-- =====================================================

CREATE OR REPLACE FUNCTION admin_generate_bar_report(p_bar_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_bar bars%ROWTYPE;
  v_sales_count INT;
  v_revenue DECIMAL;
  v_top_products JSONB;
  v_members_count INT;
  v_stock_alerts INT;
  v_owner_name TEXT;
  v_owner_email TEXT;
BEGIN
  -- Vérifier que l'utilisateur est super_admin
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Only superadmin can generate bar reports';
  END IF;

  -- Récupérer les infos du bar
  SELECT * INTO v_bar FROM bars WHERE id = p_bar_id;

  IF v_bar.id IS NULL THEN
    RAISE EXCEPTION 'Bar not found: %', p_bar_id;
  END IF;

  -- Récupérer les infos du promoteur
  SELECT name, email INTO v_owner_name, v_owner_email
  FROM users
  WHERE id = v_bar.owner_id;

  -- Récupérer les stats du jour
  SELECT
    COUNT(*)::INT,
    COALESCE(SUM(total), 0)::DECIMAL
  INTO v_sales_count, v_revenue
  FROM sales
  WHERE bar_id = p_bar_id
    AND status = 'validated'
    AND DATE(created_at) = CURRENT_DATE;

  -- Récupérer les top 10 produits du jour
  SELECT jsonb_agg(
    jsonb_build_object(
      'product_name', bp.local_name,
      'volume', COALESCE(bp.volume, ''),
      'quantity_sold', sq.total_qty,
      'revenue', sq.total_rev
    ) ORDER BY sq.total_rev DESC
  )
  INTO v_top_products
  FROM (
    SELECT
      si.bar_product_id,
      SUM(si.quantity)::INT as total_qty,
      SUM(si.unit_price * si.quantity)::DECIMAL as total_rev
    FROM sales s
    JOIN sale_items si ON s.id = si.sale_id
    WHERE s.bar_id = p_bar_id
      AND s.status = 'validated'
      AND DATE(s.created_at) = CURRENT_DATE
    GROUP BY si.bar_product_id
    ORDER BY total_rev DESC
    LIMIT 10
  ) sq
  JOIN bar_products bp ON sq.bar_product_id = bp.id;

  -- Compter les membres actifs
  SELECT COUNT(*)::INT INTO v_members_count
  FROM bar_members
  WHERE bar_id = p_bar_id
    AND is_active = true;

  -- Compter les alertes stock (produits avec stock < 10)
  SELECT COUNT(*)::INT INTO v_stock_alerts
  FROM bar_products
  WHERE bar_id = p_bar_id
    AND stock < 10
    AND is_active = true;

  -- Retourner le rapport formaté
  RETURN jsonb_build_object(
    'report_meta', jsonb_build_object(
      'generated_at', NOW(),
      'generated_by', (SELECT name FROM users WHERE id = auth.uid()),
      'report_date', CURRENT_DATE
    ),
    'bar_info', jsonb_build_object(
      'id', v_bar.id,
      'name', v_bar.name,
      'address', COALESCE(v_bar.address, 'Non renseignée'),
      'phone', COALESCE(v_bar.phone, 'Non renseigné'),
      'is_active', v_bar.is_active,
      'status', CASE WHEN v_bar.is_active THEN 'Actif' ELSE 'Suspendu' END,
      'created_at', v_bar.created_at,
      'closing_hour', v_bar.closing_hour
    ),
    'owner_info', jsonb_build_object(
      'name', COALESCE(v_owner_name, 'Inconnu'),
      'email', COALESCE(v_owner_email, 'N/A')
    ),
    'daily_stats', jsonb_build_object(
      'sales_count', v_sales_count,
      'total_revenue', v_revenue,
      'average_sale', CASE
        WHEN v_sales_count > 0 THEN ROUND((v_revenue / v_sales_count)::NUMERIC, 2)
        ELSE 0
      END
    ),
    'top_products', COALESCE(v_top_products, '[]'::jsonb),
    'team', jsonb_build_object(
      'active_members_count', v_members_count
    ),
    'inventory', jsonb_build_object(
      'stock_alerts_count', v_stock_alerts
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION admin_generate_bar_report IS 'Generate a comprehensive daily report for a bar (sales, top products, team, inventory alerts)';

-- =====================================================
-- 2. RPC: Get Bar Audit Logs (Phase 10.3)
-- =====================================================

CREATE OR REPLACE FUNCTION admin_get_bar_audit_logs(
  p_bar_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  action TEXT,
  bar_id UUID,
  bar_name TEXT,
  old_values JSONB,
  new_values JSONB,
  modified_by UUID,
  modified_by_name TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  -- Vérifier que l'utilisateur est super_admin
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Only superadmin can view audit logs';
  END IF;

  RETURN QUERY
  SELECT
    bal.id,
    bal.action,
    bal.bar_id,
    bal.bar_name,
    bal.old_values,
    bal.new_values,
    bal.modified_by,
    bal.modified_by_name,
    bal.created_at
  FROM bar_audit_log bal
  WHERE (p_bar_id IS NULL OR bal.bar_id = p_bar_id)
  ORDER BY bal.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION admin_get_bar_audit_logs IS 'Retrieve audit logs for bar management actions (CREATE, UPDATE, SUSPEND, ACTIVATE, DELETE)';

-- =====================================================
-- 3. GRANT PERMISSIONS
-- =====================================================

GRANT EXECUTE ON FUNCTION admin_generate_bar_report TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_bar_audit_logs TO authenticated;

-- =====================================================
-- 4. VERIFICATION
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '
    ╔════════════════════════════════════════════════════════════╗
    ║         BAR REPORT & AUDIT RPCs - Phase 10.2/10.3         ║
    ╚════════════════════════════════════════════════════════════╝

    ✅ Created admin_generate_bar_report(p_bar_id) RPC
       Returns: JSONB report with bar info, daily stats, top products, team, inventory alerts

    ✅ Created admin_get_bar_audit_logs(p_bar_id, p_limit, p_offset) RPC
       Returns: Table of audit log entries with full change history

    ✅ Both functions secured with is_super_admin() check
    ✅ Granted EXECUTE permissions to authenticated users

    Usage examples:
    • SELECT admin_generate_bar_report(''bar-uuid'');
    • SELECT * FROM admin_get_bar_audit_logs(NULL, 100, 0); -- All logs
    • SELECT * FROM admin_get_bar_audit_logs(''bar-uuid'', 50, 0); -- Bar-specific
    ';
END $$;

COMMIT;
