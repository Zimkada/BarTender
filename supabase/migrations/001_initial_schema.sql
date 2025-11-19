-- =====================================================
-- BARTENDER PRO - SCHEMA COMPLET V1.0
-- Multi-tenant SaaS pour gestion de bars au Bénin
-- Date: 19 Janvier 2025
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. USERS & AUTHENTICATION
-- =====================================================

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  first_login BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,

  CONSTRAINT username_min_length CHECK (char_length(username) >= 3),
  CONSTRAINT phone_format CHECK (phone ~ '^[0-9+\s()-]+$')
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_is_active ON users(is_active);

COMMENT ON TABLE users IS 'Utilisateurs du système - tous rôles confondus';
COMMENT ON COLUMN users.first_login IS 'true = doit changer son mot de passe à la première connexion';

-- =====================================================
-- 2. BARS & ORGANIZATION
-- =====================================================

CREATE TABLE bars (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  email TEXT,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Settings as JSONB for flexibility
  settings JSONB NOT NULL DEFAULT '{
    "currency": "XOF",
    "currencySymbol": "FCFA",
    "timezone": "Africa/Porto-Novo",
    "language": "fr",
    "businessDayCloseHour": 6,
    "operatingMode": "full",
    "consignmentExpirationDays": 7
  }'::jsonb,

  CONSTRAINT name_min_length CHECK (char_length(name) >= 2)
);

CREATE INDEX idx_bars_owner ON bars(owner_id);
CREATE INDEX idx_bars_is_active ON bars(is_active);

COMMENT ON TABLE bars IS 'Bars - chaque bar est un tenant isolé';
COMMENT ON COLUMN bars.settings IS 'Configuration flexible: devise, mode opération, etc.';

-- Bar Members (multi-tenant user-bar associations)
CREATE TABLE bar_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bar_id UUID NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'promoteur', 'gerant', 'serveur')),
  assigned_by UUID NOT NULL REFERENCES users(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT true,

  UNIQUE(user_id, bar_id)
);

CREATE INDEX idx_bar_members_user ON bar_members(user_id);
CREATE INDEX idx_bar_members_bar ON bar_members(bar_id);
CREATE INDEX idx_bar_members_active ON bar_members(is_active);

COMMENT ON TABLE bar_members IS 'Association users ↔ bars avec rôles spécifiques';

-- =====================================================
-- 3. CATALOGUE GLOBAL (Super Admin uniquement)
-- =====================================================

CREATE TABLE global_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  color TEXT DEFAULT '#3B82F6',
  icon TEXT,
  order_index INTEGER DEFAULT 0,
  is_system BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_global_categories_order ON global_categories(order_index);

COMMENT ON TABLE global_categories IS 'Catégories standards (Bière, Soda, etc.) - au singulier';

-- Insertion des catégories par défaut
INSERT INTO global_categories (name, icon, order_index) VALUES
('Bière', '🍺', 1),
('Soda', '🥤', 2),
('Eau', '💧', 3),
('Jus', '🧃', 4),
('Spiritueux', '🥃', 5),
('Vin', '🍷', 6),
('Snack', '🍿', 7);

CREATE TABLE global_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  brand TEXT,
  manufacturer TEXT,
  volume TEXT NOT NULL,
  volume_ml INTEGER,
  category TEXT NOT NULL,
  subcategory TEXT,

  -- Informations officielles
  official_image TEXT,
  barcode TEXT UNIQUE,
  description TEXT,

  -- Prix suggérés (non contraignants)
  suggested_price_min NUMERIC(12, 2),
  suggested_price_max NUMERIC(12, 2),

  -- Métadonnées
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_product UNIQUE(name, volume, brand)
);

CREATE INDEX idx_global_products_name ON global_products(name);
CREATE INDEX idx_global_products_barcode ON global_products(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX idx_global_products_category ON global_products(category);

COMMENT ON TABLE global_products IS 'Catalogue global des produits - géré par Super Admin';
COMMENT ON COLUMN global_products.barcode IS 'Code-barre EAN-13 - optionnel mais unique';
COMMENT ON COLUMN global_products.suggested_price_min IS 'Prix suggéré minimum - non contraignant';

-- Exemples de produits (à enrichir progressivement)
INSERT INTO global_products (name, brand, volume, volume_ml, category, barcode) VALUES
('Flag', 'Flag', '33cl', 330, 'Bière', '6001087001015'),
('Flag', 'Flag', '60cl', 600, 'Bière', '6001087001060'),
('Beaufort', 'Beaufort', '33cl', 330, 'Bière', '6001087228015'),
('Beaufort', 'Beaufort', '60cl', 600, 'Bière', '6001087228060'),
('Guinness', 'Guinness', '33cl', 330, 'Bière', '5000213101049'),
('Coca-Cola', 'Coca-Cola', '33cl', 330, 'Soda', '5449000000996'),
('Coca-Cola', 'Coca-Cola', '50cl', 500, 'Soda', '5449000000217'),
('Fanta', 'Fanta', '33cl', 330, 'Soda', '5449000000439'),
('Sprite', 'Sprite', '33cl', 330, 'Soda', '5449000000644');

-- =====================================================
-- 4. PRODUITS & INVENTAIRE PAR BAR
-- =====================================================

CREATE TABLE bar_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bar_id UUID NOT NULL REFERENCES bars(id) ON DELETE CASCADE,

  -- Soit lien vers global, soit custom
  global_category_id UUID REFERENCES global_categories(id),
  custom_name TEXT,
  custom_color TEXT,

  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CHECK (
    (global_category_id IS NOT NULL) OR
    (custom_name IS NOT NULL)
  ),

  UNIQUE(bar_id, global_category_id)
);

CREATE INDEX idx_bar_categories_bar ON bar_categories(bar_id);
CREATE INDEX idx_bar_categories_global ON bar_categories(global_category_id);

COMMENT ON TABLE bar_categories IS 'Catégories par bar - peut utiliser global ou créer custom';

CREATE TABLE bar_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bar_id UUID NOT NULL REFERENCES bars(id) ON DELETE CASCADE,

  -- Lien vers catalogue global (OPTIONNEL)
  global_product_id UUID REFERENCES global_products(id),

  -- Informations locales (peuvent override le global)
  local_name TEXT,
  local_image TEXT,
  local_category_id UUID REFERENCES bar_categories(id),

  -- Données propres au bar
  price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  alert_threshold INTEGER DEFAULT 10 CHECK (alert_threshold >= 0),

  -- Flags
  is_custom_product BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Contraintes
  CHECK (
    (global_product_id IS NOT NULL) OR
    (is_custom_product = true AND local_name IS NOT NULL)
  )
);

CREATE INDEX idx_bar_products_bar ON bar_products(bar_id);
CREATE INDEX idx_bar_products_global ON bar_products(global_product_id);
CREATE INDEX idx_bar_products_stock ON bar_products(stock);

COMMENT ON TABLE bar_products IS 'Produits par bar - lien vers global OU custom';
COMMENT ON COLUMN bar_products.price IS 'Prix de vente - propre à chaque bar';
COMMENT ON COLUMN bar_products.stock IS 'Stock physique - propre à chaque bar';

CREATE TABLE supplies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bar_id UUID NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES bar_products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  lot_size INTEGER NOT NULL CHECK (lot_size > 0),
  lot_price NUMERIC(12, 2) NOT NULL CHECK (lot_price >= 0),
  supplier TEXT NOT NULL,
  date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_cost NUMERIC(12, 2) NOT NULL CHECK (total_cost >= 0),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_supplies_bar ON supplies(bar_id);
CREATE INDEX idx_supplies_product ON supplies(product_id);
CREATE INDEX idx_supplies_date ON supplies(date DESC);

-- =====================================================
-- 5. PROMOTIONS
-- =====================================================

CREATE TABLE promotions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bar_id UUID NOT NULL REFERENCES bars(id) ON DELETE CASCADE,

  -- Informations générales
  name TEXT NOT NULL,
  description TEXT,

  -- Type de promotion
  type TEXT CHECK (type IN (
    'quantity_discount',
    'time_based',
    'product_discount',
    'bundle_price',
    'buy_x_get_y'
  )),

  -- Configuration flexible (JSONB pour s'adapter à tous les types)
  discount_config JSONB NOT NULL,

  -- Période de validité
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,

  -- Restrictions horaires optionnelles
  time_restrictions JSONB,

  -- Limites d'utilisation
  max_uses_per_customer INTEGER,
  max_total_uses INTEGER,
  current_uses INTEGER DEFAULT 0,

  -- Statut
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0,

  -- Audit
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_promotions_bar ON promotions(bar_id);
CREATE INDEX idx_promotions_active ON promotions(is_active);
CREATE INDEX idx_promotions_dates ON promotions(start_date, end_date);

COMMENT ON TABLE promotions IS 'Promotions par bar - types: %, fixe, bundle prix, buy X get Y';
COMMENT ON COLUMN promotions.discount_config IS 'Configuration JSON flexible selon le type de promo';

-- =====================================================
-- 6. SALES & RETURNS
-- =====================================================

CREATE TABLE sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bar_id UUID NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  items JSONB NOT NULL,

  -- Montants détaillés
  subtotal NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0),
  discount_total NUMERIC(12, 2) DEFAULT 0 CHECK (discount_total >= 0),
  total NUMERIC(12, 2) NOT NULL CHECK (total >= 0),

  currency TEXT NOT NULL DEFAULT 'XOF',
  status TEXT NOT NULL CHECK (status IN ('pending', 'validated', 'rejected')),

  -- Détail des promotions appliquées
  applied_promotions JSONB,

  -- Traceability
  created_by UUID NOT NULL REFERENCES users(id),
  validated_by UUID REFERENCES users(id),
  rejected_by UUID REFERENCES users(id),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  validated_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,

  -- Optional fields
  assigned_to TEXT,
  table_number TEXT,

  CONSTRAINT validated_fields CHECK (
    (status = 'validated' AND validated_by IS NOT NULL AND validated_at IS NOT NULL) OR
    (status = 'rejected' AND rejected_by IS NOT NULL AND rejected_at IS NOT NULL) OR
    (status = 'pending')
  )
);

CREATE INDEX idx_sales_bar ON sales(bar_id);
CREATE INDEX idx_sales_status ON sales(status);
CREATE INDEX idx_sales_created_by ON sales(created_by);
CREATE INDEX idx_sales_created_at ON sales(created_at DESC);

COMMENT ON TABLE sales IS 'Ventes avec workflow validation + support promotions';
COMMENT ON COLUMN sales.subtotal IS 'Prix avant promotions';
COMMENT ON COLUMN sales.discount_total IS 'Total économisé via promotions';
COMMENT ON COLUMN sales.total IS 'Prix final payé (subtotal - discount_total)';

CREATE TABLE sale_promotions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  promotion_id UUID NOT NULL REFERENCES promotions(id),

  -- Détails de l'application
  discount_amount NUMERIC(12, 2) NOT NULL CHECK (discount_amount >= 0),
  items_affected JSONB,

  applied_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sale_promotions_sale ON sale_promotions(sale_id);
CREATE INDEX idx_sale_promotions_promotion ON sale_promotions(promotion_id);

COMMENT ON TABLE sale_promotions IS 'Lien ventes ↔ promotions appliquées';

CREATE TABLE returns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bar_id UUID NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES bar_products(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  product_volume TEXT NOT NULL,
  quantity_sold INTEGER NOT NULL CHECK (quantity_sold > 0),
  quantity_returned INTEGER NOT NULL CHECK (quantity_returned > 0 AND quantity_returned <= quantity_sold),
  reason TEXT NOT NULL CHECK (reason IN ('defective', 'wrong_item', 'customer_change', 'expired', 'other')),
  returned_by UUID NOT NULL REFERENCES users(id),
  returned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  refund_amount NUMERIC(12, 2) NOT NULL CHECK (refund_amount >= 0),
  is_refunded BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'restocked')),
  auto_restock BOOLEAN NOT NULL DEFAULT false,
  manual_restock_required BOOLEAN NOT NULL DEFAULT false,
  restocked_at TIMESTAMPTZ,
  notes TEXT,
  custom_refund BOOLEAN,
  custom_restock BOOLEAN,
  original_seller UUID REFERENCES users(id)
);

CREATE INDEX idx_returns_bar ON returns(bar_id);
CREATE INDEX idx_returns_sale ON returns(sale_id);
CREATE INDEX idx_returns_status ON returns(status);

-- =====================================================
-- 7. CONSIGNMENTS
-- =====================================================

CREATE TABLE consignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bar_id UUID NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES bar_products(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  product_volume TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  claimed_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('active', 'claimed', 'expired', 'forfeited')),
  created_by UUID NOT NULL REFERENCES users(id),
  claimed_by UUID REFERENCES users(id),
  original_seller UUID REFERENCES users(id),
  customer_name TEXT,
  customer_phone TEXT,
  notes TEXT
);

CREATE INDEX idx_consignments_bar ON consignments(bar_id);
CREATE INDEX idx_consignments_status ON consignments(status);
CREATE INDEX idx_consignments_expires ON consignments(expires_at);

-- =====================================================
-- 8. ACCOUNTING
-- =====================================================

CREATE TABLE expense_categories_custom (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bar_id UUID NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id),

  UNIQUE(bar_id, name)
);

CREATE INDEX idx_expense_categories_bar ON expense_categories_custom(bar_id);

CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bar_id UUID NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  category TEXT NOT NULL CHECK (category IN ('supply', 'water', 'electricity', 'maintenance', 'investment', 'custom')),
  custom_category_id UUID REFERENCES expense_categories_custom(id),
  date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  description TEXT,
  notes TEXT,
  related_supply_id UUID REFERENCES supplies(id),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_expenses_bar ON expenses(bar_id);
CREATE INDEX idx_expenses_date ON expenses(date DESC);
CREATE INDEX idx_expenses_category ON expenses(category);

CREATE TABLE salaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bar_id UUID NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES bar_members(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  period TEXT NOT NULL CHECK (period ~ '^\d{4}-\d{2}$'),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(bar_id, member_id, period)
);

CREATE INDEX idx_salaries_bar ON salaries(bar_id);
CREATE INDEX idx_salaries_period ON salaries(period DESC);

CREATE TABLE initial_balances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bar_id UUID NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  description TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_locked BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_initial_balances_bar ON initial_balances(bar_id);

CREATE TABLE capital_contributions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bar_id UUID NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  description TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('owner', 'partner', 'investor', 'loan', 'other')),
  source_details TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_capital_contributions_bar ON capital_contributions(bar_id);
CREATE INDEX idx_capital_contributions_date ON capital_contributions(date DESC);

CREATE TABLE accounting_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bar_id UUID NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('sale', 'return', 'supply', 'expense', 'salary', 'consignment', 'initial_balance')),
  amount NUMERIC(12, 2) NOT NULL,
  date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reference_id UUID,
  description TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_accounting_transactions_bar ON accounting_transactions(bar_id);
CREATE INDEX idx_accounting_transactions_date ON accounting_transactions(date DESC);
CREATE INDEX idx_accounting_transactions_type ON accounting_transactions(type);

-- =====================================================
-- 9. ADMIN FEATURES
-- =====================================================

CREATE TABLE admin_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('high', 'medium', 'info')),
  bar_id UUID REFERENCES bars(id) ON DELETE CASCADE,
  bar_name TEXT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_read BOOLEAN NOT NULL DEFAULT false,
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB,
  actions JSONB
);

CREATE INDEX idx_admin_notifications_bar ON admin_notifications(bar_id);
CREATE INDEX idx_admin_notifications_is_read ON admin_notifications(is_read);
CREATE INDEX idx_admin_notifications_timestamp ON admin_notifications(timestamp DESC);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  user_id UUID NOT NULL REFERENCES users(id),
  user_name TEXT NOT NULL,
  user_role TEXT NOT NULL,
  bar_id UUID REFERENCES bars(id) ON DELETE CASCADE,
  bar_name TEXT,
  ip_address TEXT,
  user_agent TEXT,
  description TEXT NOT NULL,
  metadata JSONB,
  related_entity_id UUID,
  related_entity_type TEXT CHECK (related_entity_type IN ('bar', 'user', 'product', 'sale', 'expense'))
);

CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_bar ON audit_logs(bar_id);
CREATE INDEX idx_audit_logs_event ON audit_logs(event);

-- =====================================================
-- 10. INTELLIGENCE ARTIFICIELLE
-- =====================================================

CREATE TABLE ai_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  bar_id UUID REFERENCES bars(id) ON DELETE CASCADE,

  -- Conversation
  messages JSONB NOT NULL,

  -- Contexte
  context_type TEXT,
  context_data JSONB,

  -- Suivi
  created_at TIMESTAMPTZ DEFAULT NOW(),
  tokens_used INTEGER,
  feedback INTEGER CHECK (feedback IN (-1, 0, 1))
);

CREATE INDEX idx_ai_conversations_user ON ai_conversations(user_id);
CREATE INDEX idx_ai_conversations_bar ON ai_conversations(bar_id);
CREATE INDEX idx_ai_conversations_created ON ai_conversations(created_at DESC);

COMMENT ON TABLE ai_conversations IS 'Historique conversations avec l''assistant IA';

CREATE TABLE ai_insights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bar_id UUID NOT NULL REFERENCES bars(id) ON DELETE CASCADE,

  type TEXT CHECK (type IN ('prediction', 'recommendation', 'alert', 'analysis')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  confidence NUMERIC(3, 2) CHECK (confidence >= 0 AND confidence <= 1),

  data JSONB,

  is_read BOOLEAN DEFAULT false,
  is_acted_upon BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX idx_ai_insights_bar ON ai_insights(bar_id);
CREATE INDEX idx_ai_insights_type ON ai_insights(type);
CREATE INDEX idx_ai_insights_created ON ai_insights(created_at DESC);

COMMENT ON TABLE ai_insights IS 'Insights générés automatiquement par l''IA';

-- =====================================================
-- 11. VUES MATERIALISEES (Performance Analytics)
-- =====================================================

CREATE MATERIALIZED VIEW bar_weekly_stats AS
SELECT
  bar_id,
  DATE_TRUNC('week', created_at) as week,
  COUNT(*) as sales_count,
  SUM(total) as revenue,
  SUM(discount_total) as total_discounts,
  AVG(total) as avg_sale_value,
  ARRAY_AGG(DISTINCT created_by) as active_sellers
FROM sales
WHERE status = 'validated'
GROUP BY bar_id, week;

CREATE INDEX idx_bar_weekly_stats_bar ON bar_weekly_stats(bar_id);
CREATE INDEX idx_bar_weekly_stats_week ON bar_weekly_stats(week DESC);

COMMENT ON MATERIALIZED VIEW bar_weekly_stats IS 'Stats hebdomadaires par bar - rafraîchir quotidiennement';

-- Fonction pour rafraîchir les vues matérialisées
CREATE OR REPLACE FUNCTION refresh_materialized_views()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW bar_weekly_stats;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION refresh_materialized_views IS 'Appeler cette fonction chaque nuit pour rafraîchir les stats';

-- =====================================================
-- 12. TRIGGERS & FUNCTIONS
-- =====================================================

-- Fonction pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger sur promotions
CREATE TRIGGER promotions_updated_at
  BEFORE UPDATE ON promotions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- FIN DU SCHEMA
-- =====================================================

-- Afficher un message de succès
DO $$
BEGIN
  RAISE NOTICE '✅ Schéma BarTender Pro créé avec succès !';
  RAISE NOTICE 'Tables créées: %', (
    SELECT COUNT(*) FROM information_schema.tables
    WHERE table_schema = 'public'
  );
END $$;
