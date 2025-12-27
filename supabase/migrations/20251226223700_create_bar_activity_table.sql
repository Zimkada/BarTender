-- Migration: Créer table bar_activity pour optimisation COUNT
-- Description: Table d'agrégats temps réel pour éviter COUNT(*) coûteux sur table sales
-- Compatibilité: Supabase Free + Pro

-- Table agrégats temps réel
CREATE TABLE IF NOT EXISTS bar_activity (
  bar_id UUID PRIMARY KEY REFERENCES bars(id) ON DELETE CASCADE,
  sales_last_5min INTEGER DEFAULT 0,
  sales_last_hour INTEGER DEFAULT 0,
  last_sale_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour requêtes fréquentes
CREATE INDEX idx_bar_activity_updated ON bar_activity(updated_at);

-- Fonction de mise à jour automatique
CREATE OR REPLACE FUNCTION update_bar_activity()
RETURNS TRIGGER AS $$
BEGIN
  -- Insérer ou mettre à jour les agrégats
  INSERT INTO bar_activity (bar_id, sales_last_5min, sales_last_hour, last_sale_at)
  VALUES (
    NEW.bar_id,
    1,
    1,
    NEW.created_at
  )
  ON CONFLICT (bar_id) DO UPDATE SET
    sales_last_5min = (
      SELECT COUNT(*) FROM sales 
      WHERE bar_id = NEW.bar_id 
        AND created_at >= NOW() - INTERVAL '5 minutes'
        AND status = 'validated'
    ),
    sales_last_hour = (
      SELECT COUNT(*) FROM sales 
      WHERE bar_id = NEW.bar_id 
        AND created_at >= NOW() - INTERVAL '1 hour'
        AND status = 'validated'
    ),
    last_sale_at = NEW.created_at,
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger sur insertion vente
CREATE TRIGGER trg_update_bar_activity
AFTER INSERT ON sales
FOR EACH ROW
EXECUTE FUNCTION update_bar_activity();

-- Fonction de nettoyage périodique (appelée par Vercel Cron ou pg_cron)
CREATE OR REPLACE FUNCTION cleanup_bar_activity()
RETURNS void AS $$
BEGIN
  UPDATE bar_activity
  SET 
    sales_last_5min = (
      SELECT COUNT(*) FROM sales 
      WHERE bar_id = bar_activity.bar_id 
        AND created_at >= NOW() - INTERVAL '5 minutes'
        AND status = 'validated'
    ),
    sales_last_hour = (
      SELECT COUNT(*) FROM sales 
      WHERE bar_id = bar_activity.bar_id 
        AND created_at >= NOW() - INTERVAL '1 hour'
        AND status = 'validated'
    ),
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- RLS Policies
ALTER TABLE bar_activity ENABLE ROW LEVEL SECURITY;

-- Lecture pour membres du bar
CREATE POLICY "Bar members can view activity"
  ON bar_activity FOR SELECT
  USING (
    bar_id IN (
      SELECT bar_id FROM bar_members 
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Commentaires
COMMENT ON TABLE bar_activity IS 'Agrégats temps réel pour optimisation COUNT sur sales';
COMMENT ON FUNCTION update_bar_activity() IS 'Mise à jour automatique agrégats lors insertion vente';
COMMENT ON FUNCTION cleanup_bar_activity() IS 'Nettoyage périodique agrégats (appelé par cron)';
