-- Migration 047: Système de Promotions et Événements
-- Date: 2025-11-28
-- Description: Tables pour gérer les promotions (bundle, special_price, fixed_discount, percentage)
--              et les événements (jours fériés, anniversaires, matchs, etc.)

-- ============================================================================
-- TYPES ENUM
-- ============================================================================

-- Type de promotion
CREATE TYPE promotion_type AS ENUM (
  'bundle',           -- Lot : X unités à prix fixe (ex: 3 bières à 1000 FCFA)
  'fixed_discount',   -- Réduction montant fixe (ex: -50 FCFA)
  'percentage',       -- Réduction pourcentage (ex: -10%)
  'special_price'     -- Prix spécial avec horaires optionnels (ex: Happy Hour)
);

-- Statut promotion
CREATE TYPE promotion_status AS ENUM (
  'draft',      -- Brouillon (non visible clients)
  'scheduled',  -- Programmée (pas encore active)
  'active',     -- Active (visible et applicable)
  'paused',     -- En pause (temporairement désactivée)
  'expired',    -- Expirée (date fin dépassée)
  'cancelled'   -- Annulée (définitivement)
);

-- Type d'événement
CREATE TYPE event_type AS ENUM (
  'holiday',      -- Jour férié (Nouvel An, Noël, etc.)
  'anniversary',  -- Anniversaire bar
  'sports',       -- Événement sportif (match important)
  'theme_night',  -- Soirée thématique
  'custom'        -- Personnalisé
);

-- ============================================================================
-- TABLE: promotions
-- ============================================================================

CREATE TABLE promotions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bar_id UUID NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  
  -- Informations générales
  name TEXT NOT NULL,
  description TEXT,
  type promotion_type NOT NULL,
  status promotion_status DEFAULT 'draft',
  
  -- Ciblage produits
  target_type TEXT NOT NULL CHECK (target_type IN ('product', 'category', 'all')),
  target_product_ids UUID[],  -- Si target_type = 'product'
  target_category_ids UUID[], -- Si target_type = 'category'
  
  -- Configuration BUNDLE (ex: 3 bières à 1000 FCFA)
  bundle_quantity INT,
  bundle_price DECIMAL(10,2),
  
  -- Configuration FIXED_DISCOUNT (ex: -50 FCFA)
  discount_amount DECIMAL(10,2),
  
  -- Configuration PERCENTAGE (ex: -10%)
  discount_percentage DECIMAL(5,2),
  
  -- Configuration SPECIAL_PRICE (ex: Bière à 300 FCFA)
  special_price DECIMAL(10,2),
  time_start TIME,  -- OPTIONNEL : Pour Happy Hour (ex: 17:00)
  time_end TIME,    -- OPTIONNEL : Pour Happy Hour (ex: 19:00)
  
  -- Planification temporelle
  start_date DATE NOT NULL,
  end_date DATE,
  is_recurring BOOLEAN DEFAULT false,
  recurrence_days INT[], -- [0-6] : 0=Dimanche, 1=Lundi, ..., 6=Samedi
  
  -- Limites d'utilisation
  max_uses_per_customer INT,  -- Limite par client (NULL = illimité)
  max_total_uses INT,          -- Limite globale (NULL = illimité)
  current_uses INT DEFAULT 0,  -- Compteur actuel
  
  -- Priorité (si plusieurs promos applicables)
  priority INT DEFAULT 0,  -- Plus élevé = prioritaire
  
  -- Traçabilité
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- ============================================================================
  -- CONTRAINTES DE VALIDATION
  -- ============================================================================
  
  -- Validation BUNDLE
  CONSTRAINT valid_bundle CHECK (
    (type = 'bundle' AND bundle_quantity > 0 AND bundle_price > 0) 
    OR type != 'bundle'
  ),
  
  -- Validation FIXED_DISCOUNT
  CONSTRAINT valid_fixed_discount CHECK (
    (type = 'fixed_discount' AND discount_amount > 0) 
    OR type != 'fixed_discount'
  ),
  
  -- Validation PERCENTAGE
  CONSTRAINT valid_percentage CHECK (
    (type = 'percentage' AND discount_percentage > 0 AND discount_percentage <= 100) 
    OR type != 'percentage'
  ),
  
  -- Validation SPECIAL_PRICE
  CONSTRAINT valid_special_price CHECK (
    (type = 'special_price' AND special_price > 0) 
    OR type != 'special_price'
  ),
  
  -- Validation ciblage
  CONSTRAINT valid_target CHECK (
    (target_type = 'product' AND target_product_ids IS NOT NULL AND array_length(target_product_ids, 1) > 0)
    OR (target_type = 'category' AND target_category_ids IS NOT NULL AND array_length(target_category_ids, 1) > 0)
    OR target_type = 'all'
  ),
  
  -- Validation dates
  CONSTRAINT valid_dates CHECK (
    end_date IS NULL OR end_date >= start_date
  ),
  
  -- Validation limites
  CONSTRAINT valid_limits CHECK (
    (max_uses_per_customer IS NULL OR max_uses_per_customer > 0)
    AND (max_total_uses IS NULL OR max_total_uses > 0)
  )
);

-- Index pour performance
CREATE INDEX idx_promotions_bar_id ON promotions(bar_id);
CREATE INDEX idx_promotions_status ON promotions(status);
CREATE INDEX idx_promotions_dates ON promotions(start_date, end_date);
CREATE INDEX idx_promotions_type ON promotions(type);
CREATE INDEX idx_promotions_target_products ON promotions USING GIN (target_product_ids);
CREATE INDEX idx_promotions_target_categories ON promotions USING GIN (target_category_ids);

-- Index composite pour requêtes fréquentes
CREATE INDEX idx_promotions_active_lookup ON promotions(bar_id, status, start_date, end_date)
WHERE status = 'active';

-- ============================================================================
-- TABLE: promotion_applications (Historique)
-- ============================================================================

CREATE TABLE promotion_applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bar_id UUID NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  
  -- Détails application
  product_id UUID NOT NULL,
  quantity_sold INT NOT NULL CHECK (quantity_sold > 0),
  original_price DECIMAL(10,2) NOT NULL CHECK (original_price >= 0),
  discounted_price DECIMAL(10,2) NOT NULL CHECK (discounted_price >= 0),
  discount_amount DECIMAL(10,2) NOT NULL CHECK (discount_amount >= 0),
  
  -- Traçabilité
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  applied_by UUID NOT NULL
);

-- Index
CREATE INDEX idx_promo_apps_bar_id ON promotion_applications(bar_id);
CREATE INDEX idx_promo_apps_promotion_id ON promotion_applications(promotion_id);
CREATE INDEX idx_promo_apps_sale_id ON promotion_applications(sale_id);
CREATE INDEX idx_promo_apps_applied_at ON promotion_applications(applied_at);
CREATE INDEX idx_promo_apps_product_id ON promotion_applications(product_id);

-- Index composite pour analytics
CREATE INDEX idx_promo_apps_analytics ON promotion_applications(promotion_id, applied_at);

-- ============================================================================
-- TABLE: bar_events (Événements spéciaux)
-- ============================================================================

CREATE TABLE bar_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bar_id UUID NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  
  event_type event_type NOT NULL,
  event_name TEXT NOT NULL,
  event_date DATE NOT NULL,
  
  -- Impact sur ventes (pour prévisions)
  impact_multiplier DECIMAL(5,2) DEFAULT 1.0 CHECK (impact_multiplier >= 0),
  
  -- Récurrence
  is_recurring BOOLEAN DEFAULT false,
  recurrence_rule TEXT, -- Format: 'yearly_12_25', 'monthly_15', 'weekly_5'
  
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX idx_bar_events_bar_date ON bar_events(bar_id, event_date);
CREATE INDEX idx_bar_events_type ON bar_events(event_type);
CREATE INDEX idx_bar_events_active ON bar_events(bar_id, is_active, event_date)
WHERE is_active = true;

-- ============================================================================
-- FONCTIONS UTILITAIRES
-- ============================================================================

-- Fonction pour incrémenter le compteur d'utilisations d'une promotion
CREATE OR REPLACE FUNCTION increment_promotion_uses(p_promotion_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE promotions
  SET current_uses = current_uses + 1,
      updated_at = NOW()
  WHERE id = p_promotion_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fonction pour auto-expirer les promotions
CREATE OR REPLACE FUNCTION auto_expire_promotions()
RETURNS void AS $$
BEGIN
  UPDATE promotions
  SET status = 'expired',
      updated_at = NOW()
  WHERE status = 'active'
    AND end_date IS NOT NULL
    AND end_date < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fonction pour auto-activer les promotions programmées
CREATE OR REPLACE FUNCTION auto_activate_scheduled_promotions()
RETURNS void AS $$
BEGIN
  UPDATE promotions
  SET status = 'active',
      updated_at = NOW()
  WHERE status = 'scheduled'
    AND start_date <= CURRENT_DATE
    AND (end_date IS NULL OR end_date >= CURRENT_DATE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Table: promotions
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view promotions for their bars"
ON promotions FOR SELECT
USING (bar_id IN (SELECT bar_id FROM bar_members WHERE user_id = auth.uid()));

CREATE POLICY "Admins can manage promotions for their bars"
ON promotions FOR ALL
USING (bar_id IN (
  SELECT bar_id FROM bar_members
  WHERE user_id = auth.uid() AND role IN ('admin', 'owner', 'promoteur')
));

-- Table: promotion_applications
ALTER TABLE promotion_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view promotion applications for their bars"
ON promotion_applications FOR SELECT
USING (bar_id IN (SELECT bar_id FROM bar_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert promotion applications for their bars"
ON promotion_applications FOR INSERT
WITH CHECK (bar_id IN (SELECT bar_id FROM bar_members WHERE user_id = auth.uid()));

-- Table: bar_events
ALTER TABLE bar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view events for their bars"
ON bar_events FOR SELECT
USING (bar_id IN (SELECT bar_id FROM bar_members WHERE user_id = auth.uid()));

CREATE POLICY "Admins can manage events for their bars"
ON bar_events FOR ALL
USING (bar_id IN (
  SELECT bar_id FROM bar_members
  WHERE user_id = auth.uid() AND role IN ('admin', 'owner', 'promoteur')
));

-- ============================================================================
-- GRANTS
-- ============================================================================

-- Permissions pour les utilisateurs authentifiés
GRANT SELECT, INSERT, UPDATE ON promotions TO authenticated;
GRANT SELECT, INSERT ON promotion_applications TO authenticated;
GRANT SELECT, INSERT, UPDATE ON bar_events TO authenticated;

-- Permissions pour les fonctions
GRANT EXECUTE ON FUNCTION increment_promotion_uses(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION auto_expire_promotions() TO authenticated;
GRANT EXECUTE ON FUNCTION auto_activate_scheduled_promotions() TO authenticated;

-- ============================================================================
-- COMMENTAIRES (Documentation)
-- ============================================================================

COMMENT ON TABLE promotions IS 'Promotions commerciales (bundle, prix spécial, réductions)';
COMMENT ON TABLE promotion_applications IS 'Historique des applications de promotions aux ventes';
COMMENT ON TABLE bar_events IS 'Événements spéciaux impactant les ventes (jours fériés, matchs, etc.)';

COMMENT ON COLUMN promotions.bundle_quantity IS 'Nombre d''unités pour promotion bundle (ex: 3 pour "3 bières")';
COMMENT ON COLUMN promotions.bundle_price IS 'Prix du lot pour promotion bundle (ex: 1000 FCFA pour 3 bières)';
COMMENT ON COLUMN promotions.time_start IS 'Heure début (Happy Hour) - NULL = toute la journée';
COMMENT ON COLUMN promotions.time_end IS 'Heure fin (Happy Hour) - NULL = toute la journée';
COMMENT ON COLUMN promotions.recurrence_days IS 'Jours de récurrence [0-6] : 0=Dim, 1=Lun, ..., 6=Sam';
COMMENT ON COLUMN bar_events.impact_multiplier IS 'Multiplicateur impact ventes (1.5 = +50%, 2.0 = +100%)';
COMMENT ON COLUMN bar_events.recurrence_rule IS 'Règle récurrence : yearly_MM_DD, monthly_DD, weekly_D';
