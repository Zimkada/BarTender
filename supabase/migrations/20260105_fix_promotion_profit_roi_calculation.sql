-- MIGRATION: Corriger le calcul du Profit Réalisé et du ROI avec marge réelle
-- DATE: 2026-01-05
-- OBJECTIF: Implémenter des calculs corrects basés sur la marge réelle (COGS)

-- =====================================================
-- ÉTAPE 1: Ajouter les colonnes de coût manquantes dans promotion_applications
-- =====================================================
-- Ces colonnes seront remplies avec les coûts réels du produit au moment de la vente
ALTER TABLE public.promotion_applications
ADD COLUMN IF NOT EXISTS product_cost_unit NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS product_cost_total NUMERIC DEFAULT 0;

-- =====================================================
-- ÉTAPE 2: Créer une vue pour les statistiques de profit avec marge
-- =====================================================
CREATE OR REPLACE VIEW promotion_stats_with_profit AS
SELECT
    pa.bar_id,
    pa.promotion_id,
    p.name as promotion_name,
    COUNT(pa.id)::BIGINT as total_applications,
    COALESCE(SUM(pa.discounted_price), 0) as total_revenue,
    COALESCE(SUM(pa.discount_amount), 0) as total_discount,
    COALESCE(SUM(pa.product_cost_total), 0) as total_cost_of_goods,
    -- Profit Réalisé = Revenue - COGS (coût des marchandises)
    -- C'est le profit NET après déduction du coût de production
    COALESCE(SUM(pa.discounted_price), 0) - COALESCE(SUM(pa.product_cost_total), 0) as net_profit,
    -- Marge = (Revenue - COGS) / Revenue × 100
    CASE
        WHEN COALESCE(SUM(pa.discounted_price), 0) > 0
        THEN ROUND(((COALESCE(SUM(pa.discounted_price), 0) - COALESCE(SUM(pa.product_cost_total), 0)) / COALESCE(SUM(pa.discounted_price), 0) * 100)::NUMERIC, 2)
        ELSE 0
    END as margin_percentage,
    -- ROI = (Net Profit / Total Cost) × 100
    -- Montre le retour sur chaque FCFA investi dans les coûts de production
    CASE
        WHEN COALESCE(SUM(pa.product_cost_total), 0) > 0
        THEN ROUND(((COALESCE(SUM(pa.discounted_price), 0) - COALESCE(SUM(pa.product_cost_total), 0)) / COALESCE(SUM(pa.product_cost_total), 0) * 100)::NUMERIC, 2)
        ELSE 0
    END as roi_percentage
FROM promotion_applications pa
LEFT JOIN promotions p ON pa.promotion_id = p.id
GROUP BY pa.bar_id, pa.promotion_id, p.name;

-- =====================================================
-- ÉTAPE 3: Créer une vue pour les stats globales avec profit
-- =====================================================
CREATE OR REPLACE VIEW global_promotion_stats_with_profit AS
SELECT
    bar_id,
    COUNT(*)::BIGINT as total_applications,
    COALESCE(SUM(discounted_price), 0) as total_revenue,
    COALESCE(SUM(discount_amount), 0) as total_discount,
    COALESCE(SUM(product_cost_total), 0) as total_cost_of_goods,
    -- Profit Réalisé = Revenue - COGS
    COALESCE(SUM(discounted_price), 0) - COALESCE(SUM(product_cost_total), 0) as net_profit,
    -- Marge moyenne = (Net Profit / Revenue) × 100
    CASE
        WHEN COALESCE(SUM(discounted_price), 0) > 0
        THEN ROUND(((COALESCE(SUM(discounted_price), 0) - COALESCE(SUM(product_cost_total), 0)) / COALESCE(SUM(discounted_price), 0) * 100)::NUMERIC, 2)
        ELSE 0
    END as margin_percentage,
    -- ROI global = (Net Profit / Total COGS) × 100
    CASE
        WHEN COALESCE(SUM(product_cost_total), 0) > 0
        THEN ROUND(((COALESCE(SUM(discounted_price), 0) - COALESCE(SUM(product_cost_total), 0)) / COALESCE(SUM(product_cost_total), 0) * 100)::NUMERIC, 2)
        ELSE 0
    END as roi_percentage
FROM promotion_applications
GROUP BY bar_id;

-- =====================================================
-- ÉTAPE 4: Créer la fonction RPC pour stats globales corrigées
-- =====================================================
CREATE OR REPLACE FUNCTION get_bar_global_promotion_stats_with_profit(
  p_bar_id UUID,
  p_start_date TEXT DEFAULT NULL,
  p_end_date TEXT DEFAULT NULL
)
RETURNS TABLE (
  total_revenue DECIMAL,
  total_discount DECIMAL,
  total_applications BIGINT,
  total_cost_of_goods DECIMAL,
  net_profit DECIMAL,
  margin_percentage NUMERIC,
  roi_percentage NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(pa.discounted_price), 0)::DECIMAL as total_revenue,
    COALESCE(SUM(pa.discount_amount), 0)::DECIMAL as total_discount,
    COUNT(*)::BIGINT as total_applications,
    COALESCE(SUM(pa.product_cost_total), 0)::DECIMAL as total_cost_of_goods,
    -- Net Profit = Revenue - COGS
    (COALESCE(SUM(pa.discounted_price), 0) - COALESCE(SUM(pa.product_cost_total), 0))::DECIMAL as net_profit,
    -- Marge = (Revenue - COGS) / Revenue × 100
    CASE
        WHEN COALESCE(SUM(pa.discounted_price), 0) > 0
        THEN ROUND(((COALESCE(SUM(pa.discounted_price), 0) - COALESCE(SUM(pa.product_cost_total), 0)) / COALESCE(SUM(pa.discounted_price), 0) * 100)::NUMERIC, 2)
        ELSE 0
    END::NUMERIC as margin_percentage,
    -- ROI = (Net Profit / COGS) × 100
    CASE
        WHEN COALESCE(SUM(pa.product_cost_total), 0) > 0
        THEN ROUND(((COALESCE(SUM(pa.discounted_price), 0) - COALESCE(SUM(pa.product_cost_total), 0)) / COALESCE(SUM(pa.product_cost_total), 0) * 100)::NUMERIC, 2)
        ELSE 0
    END::NUMERIC as roi_percentage
  FROM promotion_applications pa
  WHERE pa.bar_id = p_bar_id
  AND (p_start_date IS NULL OR pa.applied_at >= p_start_date::TIMESTAMP)
  AND (p_end_date IS NULL OR pa.applied_at <= p_end_date::TIMESTAMP);
END;
$$;

-- =====================================================
-- ÉTAPE 5: Créer la fonction RPC pour stats par promotion avec profit
-- =====================================================
CREATE OR REPLACE FUNCTION get_bar_promotion_stats_with_profit(
  p_bar_id UUID,
  p_start_date TEXT DEFAULT NULL,
  p_end_date TEXT DEFAULT NULL
)
RETURNS TABLE (
  promotion_id UUID,
  promotion_name TEXT,
  total_applications BIGINT,
  total_revenue DECIMAL,
  total_discount DECIMAL,
  total_cost_of_goods DECIMAL,
  net_profit DECIMAL,
  margin_percentage NUMERIC,
  roi_percentage NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id as promotion_id,
    p.name as promotion_name,
    COUNT(pa.id)::BIGINT as total_applications,
    COALESCE(SUM(pa.discounted_price), 0)::DECIMAL as total_revenue,
    COALESCE(SUM(pa.discount_amount), 0)::DECIMAL as total_discount,
    COALESCE(SUM(pa.product_cost_total), 0)::DECIMAL as total_cost_of_goods,
    (COALESCE(SUM(pa.discounted_price), 0) - COALESCE(SUM(pa.product_cost_total), 0))::DECIMAL as net_profit,
    CASE
        WHEN COALESCE(SUM(pa.discounted_price), 0) > 0
        THEN ROUND(((COALESCE(SUM(pa.discounted_price), 0) - COALESCE(SUM(pa.product_cost_total), 0)) / COALESCE(SUM(pa.discounted_price), 0) * 100)::NUMERIC, 2)
        ELSE 0
    END::NUMERIC as margin_percentage,
    CASE
        WHEN COALESCE(SUM(pa.product_cost_total), 0) > 0
        THEN ROUND(((COALESCE(SUM(pa.discounted_price), 0) - COALESCE(SUM(pa.product_cost_total), 0)) / COALESCE(SUM(pa.product_cost_total), 0) * 100)::NUMERIC, 2)
        ELSE 0
    END::NUMERIC as roi_percentage
  FROM promotions p
  LEFT JOIN promotion_applications pa ON p.id = pa.promotion_id AND pa.bar_id = p_bar_id
  WHERE p.bar_id = p_bar_id
  AND (p_start_date IS NULL OR pa.applied_at >= p_start_date::TIMESTAMP)
  AND (p_end_date IS NULL OR pa.applied_at <= p_end_date::TIMESTAMP)
  GROUP BY p.id, p.name
  ORDER BY total_revenue DESC;
END;
$$;

-- =====================================================
-- ÉTAPE 6: Accorder les permissions
-- =====================================================
GRANT EXECUTE ON FUNCTION get_bar_global_promotion_stats_with_profit(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_bar_global_promotion_stats_with_profit(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION get_bar_promotion_stats_with_profit(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_bar_promotion_stats_with_profit(UUID, TEXT, TEXT) TO service_role;
