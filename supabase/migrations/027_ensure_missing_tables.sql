-- =====================================================
-- MIGRATION 027: Ensure Missing Tables Exist
-- Date: 21 Novembre 2025
-- Description: Creates tables that might be missing due to incomplete initial migration.
-- =====================================================

-- 1. Fix SALES table columns (Prerequisite for other tables and views)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'created_by') THEN
        ALTER TABLE sales ADD COLUMN created_by UUID REFERENCES users(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'validated_by') THEN
        ALTER TABLE sales ADD COLUMN validated_by UUID REFERENCES users(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'rejected_by') THEN
        ALTER TABLE sales ADD COLUMN rejected_by UUID REFERENCES users(id);
    END IF;
END $$;

-- 2. Ensure PROMOTIONS exists
CREATE TABLE IF NOT EXISTS promotions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bar_id UUID NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT CHECK (type IN ('quantity_discount', 'time_based', 'product_discount', 'bundle_price', 'buy_x_get_y')),
  discount_config JSONB NOT NULL,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  time_restrictions JSONB,
  max_uses_per_customer INTEGER,
  max_total_uses INTEGER,
  current_uses INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promotions_bar ON promotions(bar_id);
CREATE INDEX IF NOT EXISTS idx_promotions_active ON promotions(is_active);

-- 2. Ensure SALE_PROMOTIONS exists
CREATE TABLE IF NOT EXISTS sale_promotions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  promotion_id UUID NOT NULL REFERENCES promotions(id),
  discount_amount NUMERIC(12, 2) NOT NULL CHECK (discount_amount >= 0),
  items_affected JSONB,
  applied_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sale_promotions_sale ON sale_promotions(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_promotions_promotion ON sale_promotions(promotion_id);

-- 3. Ensure RETURNS exists
CREATE TABLE IF NOT EXISTS returns (
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

CREATE INDEX IF NOT EXISTS idx_returns_bar ON returns(bar_id);
CREATE INDEX IF NOT EXISTS idx_returns_sale ON returns(sale_id);

-- 4. Ensure SALARIES exists
CREATE TABLE IF NOT EXISTS salaries (
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

CREATE INDEX IF NOT EXISTS idx_salaries_bar ON salaries(bar_id);

-- 5. Ensure INITIAL_BALANCES exists
CREATE TABLE IF NOT EXISTS initial_balances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bar_id UUID NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  description TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_locked BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_initial_balances_bar ON initial_balances(bar_id);

-- 6. Ensure CAPITAL_CONTRIBUTIONS exists
CREATE TABLE IF NOT EXISTS capital_contributions (
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

CREATE INDEX IF NOT EXISTS idx_capital_contributions_bar ON capital_contributions(bar_id);

-- 7. Ensure ACCOUNTING_TRANSACTIONS exists
CREATE TABLE IF NOT EXISTS accounting_transactions (
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

CREATE INDEX IF NOT EXISTS idx_accounting_transactions_bar ON accounting_transactions(bar_id);

-- 8. Ensure ADMIN & AI TABLES exist
CREATE TABLE IF NOT EXISTS admin_notifications (
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

CREATE TABLE IF NOT EXISTS audit_logs (
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

CREATE TABLE IF NOT EXISTS ai_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  bar_id UUID REFERENCES bars(id) ON DELETE CASCADE,
  messages JSONB NOT NULL,
  context_type TEXT,
  context_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  tokens_used INTEGER,
  feedback INTEGER CHECK (feedback IN (-1, 0, 1))
);

CREATE TABLE IF NOT EXISTS ai_insights (
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

-- 9. Ensure MATERIALIZED VIEW exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_matviews WHERE matviewname = 'bar_weekly_stats') THEN
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
  END IF;
END $$;

-- 10. Enable RLS
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE salaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE initial_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE capital_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;

-- 11. Grant permissions to authenticated
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE promotions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE sale_promotions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE returns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE salaries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE initial_balances TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE capital_contributions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE accounting_transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE admin_notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE audit_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ai_conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ai_insights TO authenticated;

-- 12. Reload Schema Cache
NOTIFY pgrst, 'reload schema';
