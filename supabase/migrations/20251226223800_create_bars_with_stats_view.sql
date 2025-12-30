-- Migration: Créer vue bars_with_stats pour éliminer N+1 queries
-- Description: Vue matérialisée avec owner et member_count pour optimiser BarsService
-- Compatibilité: Supabase Free + Pro

-- Vue matérialisée bars avec stats
CREATE MATERIALIZED VIEW IF NOT EXISTS bars_with_stats AS
SELECT 
  b.id,
  b.name,
  b.address,
  b.phone,
  b.owner_id,
  b.created_at,
  b.is_active,
  b.closing_hour,
  b.settings,
  u.name AS owner_name,
  u.phone AS owner_phone,
  COUNT(DISTINCT bm.user_id) FILTER (WHERE bm.is_active = true) AS member_count
FROM bars b
LEFT JOIN users u ON u.id = b.owner_id
LEFT JOIN bar_members bm ON bm.bar_id = b.id
WHERE b.is_active = true
GROUP BY 
  b.id, 
  b.name, 
  b.address, 
  b.phone, 
  b.owner_id, 
  b.created_at, 
  b.is_active, 
  b.closing_hour, 
  b.settings,
  u.name, 
  u.phone;

-- Index unique pour REFRESH CONCURRENTLY
CREATE UNIQUE INDEX idx_bars_with_stats_pk ON bars_with_stats(id);

-- Index pour requêtes fréquentes
CREATE INDEX idx_bars_with_stats_owner ON bars_with_stats(owner_id);
CREATE INDEX idx_bars_with_stats_active ON bars_with_stats(is_active);

-- Vue publique pour RLS
CREATE OR REPLACE VIEW public.bars_with_stats_view AS
SELECT * FROM bars_with_stats
WHERE id IN (
  SELECT bar_id FROM bar_members 
  WHERE user_id = auth.uid() AND is_active = true
);

-- Permissions
GRANT SELECT ON bars_with_stats TO authenticated;
GRANT SELECT ON public.bars_with_stats_view TO authenticated;

-- Commentaires
COMMENT ON MATERIALIZED VIEW bars_with_stats IS 'Vue optimisée bars avec owner et member_count (élimine N+1 queries)';
COMMENT ON VIEW public.bars_with_stats_view IS 'Vue publique avec RLS pour bars_with_stats';
