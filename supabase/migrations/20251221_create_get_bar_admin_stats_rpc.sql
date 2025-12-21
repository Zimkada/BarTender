-- Migration: 20251221_create_get_bar_admin_stats_rpc.sql
-- Purpose: Optimized RPC for bar statistics (used on admin click)
-- Impact: Eliminates 4 separate queries per bar stats request
-- Created: 2025-12-21

-- Drop function if exists (for safe re-runs)
DROP FUNCTION IF EXISTS public.get_bar_admin_stats(uuid);

-- Create optimized RPC function for bar admin stats
-- Combines: product count, sales count, revenue sum, pending sales count
-- Called by: BarsService.getBarStats() when admin clicks on a bar
CREATE OR REPLACE FUNCTION public.get_bar_admin_stats(p_bar_id uuid)
RETURNS TABLE (
  total_products bigint,
  total_sales bigint,
  total_revenue numeric,
  pending_sales bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    -- Count active products
    (SELECT COUNT(*)::bigint FROM public.bar_products WHERE bar_id = p_bar_id AND is_active = true) as total_products,
    -- Count validated sales
    (SELECT COUNT(*)::bigint FROM public.sales WHERE bar_id = p_bar_id AND status = 'validated') as total_sales,
    -- Sum revenue from validated sales
    (SELECT COALESCE(SUM(total), 0)::numeric FROM public.sales WHERE bar_id = p_bar_id AND status = 'validated') as total_revenue,
    -- Count pending sales
    (SELECT COUNT(*)::bigint FROM public.sales WHERE bar_id = p_bar_id AND status = 'pending') as pending_sales;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL SAFE;

-- Grant permissions for authenticated users
GRANT EXECUTE ON FUNCTION public.get_bar_admin_stats(uuid) TO authenticated;

-- Add helpful comment
COMMENT ON FUNCTION public.get_bar_admin_stats(uuid) IS
'Optimized RPC function for retrieving bar admin statistics.
Returns: product count, sales count, revenue sum, pending sales count.
Single aggregation query instead of 4 separate queries.
Security: DEFINER ensures consistent RLS application.
Performance: Suitable for on-demand loading (cached 5min by React Query)';
