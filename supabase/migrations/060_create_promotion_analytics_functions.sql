-- Fonction pour obtenir les stats par promotion pour un bar
-- Retourne: id, nom, nombre d'utilisations, CA généré, total réductions
CREATE OR REPLACE FUNCTION get_bar_promotion_stats(
  p_bar_id UUID,
  p_start_date TEXT DEFAULT NULL,
  p_end_date TEXT DEFAULT NULL
)
RETURNS TABLE (
  promotion_id UUID,
  promotion_name TEXT,
  total_applications BIGINT,
  total_revenue DECIMAL,
  total_discount DECIMAL
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
    COALESCE(SUM(pa.discounted_price), 0) as total_revenue,
    COALESCE(SUM(pa.discount_amount), 0) as total_discount
  FROM promotions p
  LEFT JOIN promotion_applications pa ON p.id = pa.promotion_id
  WHERE p.bar_id = p_bar_id
  AND (p_start_date IS NULL OR pa.applied_at >= p_start_date::TIMESTAMP)
  AND (p_end_date IS NULL OR pa.applied_at <= p_end_date::TIMESTAMP)
  GROUP BY p.id, p.name
  ORDER BY total_revenue DESC;
END;
$$;

-- Fonction pour obtenir les stats globales d'un bar
-- Retourne: CA total, réductions totales, nombre total d'utilisations
CREATE OR REPLACE FUNCTION get_bar_global_promotion_stats(
  p_bar_id UUID,
  p_start_date TEXT DEFAULT NULL,
  p_end_date TEXT DEFAULT NULL
)
RETURNS TABLE (
  total_revenue DECIMAL,
  total_discount DECIMAL,
  total_applications BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(discounted_price), 0) as total_revenue,
    COALESCE(SUM(discount_amount), 0) as total_discount,
    COUNT(*)::BIGINT as total_applications
  FROM promotion_applications
  WHERE bar_id = p_bar_id
  AND (p_start_date IS NULL OR applied_at >= p_start_date::TIMESTAMP)
  AND (p_end_date IS NULL OR applied_at <= p_end_date::TIMESTAMP);
END;
$$;

-- Accorder les permissions d'exécution
GRANT EXECUTE ON FUNCTION get_bar_promotion_stats(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_bar_global_promotion_stats(UUID, TEXT, TEXT) TO authenticated;
