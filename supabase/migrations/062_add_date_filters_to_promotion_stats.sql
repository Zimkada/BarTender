-- Migration 062: Ajouter filtres temporels aux fonctions analytics des promotions
-- Date: 2025-11-28
-- Description: Permet de filtrer les statistiques par période (semaine, mois, année, custom)

-- =====================================================
-- PARTIE 1: Modifier get_bar_global_promotion_stats
-- =====================================================

-- Supprimer l'ancienne version
DROP FUNCTION IF EXISTS get_bar_global_promotion_stats(UUID);

-- Recréer avec paramètres de dates optionnels
CREATE OR REPLACE FUNCTION get_bar_global_promotion_stats(
  p_bar_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
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
    -- Filtrage optionnel par dates
    AND (p_start_date IS NULL OR applied_at >= p_start_date)
    AND (p_end_date IS NULL OR applied_at <= p_end_date);
END;
$$;

COMMENT ON FUNCTION get_bar_global_promotion_stats IS
  'Statistiques globales des promotions avec filtrage temporel optionnel.
   Paramètres NULL = toutes les données (rétrocompatible).
   Migration 062 - Support filtres temporels.';

-- =====================================================
-- PARTIE 2: Modifier get_bar_promotion_stats
-- =====================================================

-- Supprimer l'ancienne version
DROP FUNCTION IF EXISTS get_bar_promotion_stats(UUID);

-- Recréer avec paramètres de dates optionnels
CREATE OR REPLACE FUNCTION get_bar_promotion_stats(
  p_bar_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
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
    -- Filtrage optionnel par dates
    AND (p_start_date IS NULL OR pa.applied_at >= p_start_date)
    AND (p_end_date IS NULL OR pa.applied_at <= p_end_date)
  WHERE p.bar_id = p_bar_id
  GROUP BY p.id, p.name
  ORDER BY total_revenue DESC;
END;
$$;

COMMENT ON FUNCTION get_bar_promotion_stats IS
  'Statistiques par promotion avec filtrage temporel optionnel.
   Paramètres NULL = toutes les données (rétrocompatible).
   Migration 062 - Support filtres temporels.';

-- =====================================================
-- PARTIE 3: Index pour Performance
-- =====================================================

-- Index sur applied_at pour filtrage rapide par dates
CREATE INDEX IF NOT EXISTS idx_promo_apps_bar_applied_at
ON promotion_applications(bar_id, applied_at DESC);

-- Index composite pour analytics temporelles
CREATE INDEX IF NOT EXISTS idx_promo_apps_analytics_temporal
ON promotion_applications(bar_id, promotion_id, applied_at)
INCLUDE (discounted_price, discount_amount);

-- =====================================================
-- PARTIE 4: Grants
-- =====================================================

GRANT EXECUTE ON FUNCTION get_bar_global_promotion_stats(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION get_bar_promotion_stats(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- =====================================================
-- RÉSUMÉ DES CHANGEMENTS
-- =====================================================
-- ✅ Ajout de p_start_date et p_end_date à get_bar_global_promotion_stats
-- ✅ Ajout de p_start_date et p_end_date à get_bar_promotion_stats
-- ✅ Paramètres NULL = pas de filtre (rétrocompatible)
-- ✅ Index optimisés pour filtrage par dates
-- ✅ Permissions accordées
--
-- UTILISATION:
-- -- Toutes les données (comme avant)
-- SELECT * FROM get_bar_global_promotion_stats('bar-uuid', NULL, NULL);
--
-- -- 7 derniers jours
-- SELECT * FROM get_bar_global_promotion_stats(
--   'bar-uuid',
--   NOW() - INTERVAL '7 days',
--   NOW()
-- );
