-- =====================================================
-- MIGRATION 019: Fix Schema - Add missing columns and tables
-- Date: 21 Novembre 2025
-- =====================================================

-- 1. Fix BAR_CATEGORIES table
DO $$
BEGIN
  -- Add global_category_id if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bar_categories' AND column_name = 'global_category_id') THEN
    ALTER TABLE bar_categories ADD COLUMN global_category_id UUID REFERENCES global_categories(id);
  END IF;

  -- Add custom_name if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bar_categories' AND column_name = 'custom_name') THEN
    ALTER TABLE bar_categories ADD COLUMN custom_name TEXT;
  END IF;

  -- Add custom_color if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bar_categories' AND column_name = 'custom_color') THEN
    ALTER TABLE bar_categories ADD COLUMN custom_color TEXT;
  END IF;
END $$;

-- 2. Fix BAR_PRODUCTS table (just in case)
DO $$
BEGIN
  -- Add global_product_id if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bar_products' AND column_name = 'global_product_id') THEN
    ALTER TABLE bar_products ADD COLUMN global_product_id UUID REFERENCES global_products(id);
  END IF;

  -- Add local_name if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bar_products' AND column_name = 'local_name') THEN
    ALTER TABLE bar_products ADD COLUMN local_name TEXT;
  END IF;

    -- Add local_image if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bar_products' AND column_name = 'local_image') THEN
    ALTER TABLE bar_products ADD COLUMN local_image TEXT;
  END IF;
END $$;

-- 3. Ensure CONSIGNMENTS table exists
CREATE TABLE IF NOT EXISTS consignments (
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

CREATE INDEX IF NOT EXISTS idx_consignments_bar ON consignments(bar_id);
CREATE INDEX IF NOT EXISTS idx_consignments_status ON consignments(status);
CREATE INDEX IF NOT EXISTS idx_consignments_expires ON consignments(expires_at);

-- 4. Ensure EXPENSE_CATEGORIES_CUSTOM table exists
CREATE TABLE IF NOT EXISTS expense_categories_custom (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bar_id UUID NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id),

  UNIQUE(bar_id, name)
);

CREATE INDEX IF NOT EXISTS idx_expense_categories_bar ON expense_categories_custom(bar_id);

-- 5. Ensure EXPENSES table exists
CREATE TABLE IF NOT EXISTS expenses (
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

CREATE INDEX IF NOT EXISTS idx_expenses_bar ON expenses(bar_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);

-- 6. Enable RLS on these tables
ALTER TABLE consignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_categories_custom ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- 7. Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE consignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE expense_categories_custom TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE expenses TO authenticated;

-- 8. Add RLS Policies (if they don't exist)
DO $$
BEGIN
  -- CONSIGNMENTS
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'consignments' AND policyname = 'Bar members can view consignments') THEN
    CREATE POLICY "Bar members can view consignments" ON consignments FOR SELECT USING (is_bar_member(bar_id) OR is_super_admin());
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'consignments' AND policyname = 'Managers can create consignments') THEN
    CREATE POLICY "Managers can create consignments" ON consignments FOR INSERT WITH CHECK (get_user_role(bar_id) IN ('promoteur', 'gerant') OR is_super_admin());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'consignments' AND policyname = 'Managers can update consignments') THEN
    CREATE POLICY "Managers can update consignments" ON consignments FOR UPDATE USING (get_user_role(bar_id) IN ('promoteur', 'gerant') OR is_super_admin());
  END IF;

  -- EXPENSE CATEGORIES
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'expense_categories_custom' AND policyname = 'Bar members can view expense categories') THEN
    CREATE POLICY "Bar members can view expense categories" ON expense_categories_custom FOR SELECT USING (is_bar_member(bar_id) OR is_super_admin());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'expense_categories_custom' AND policyname = 'Managers can manage expense categories') THEN
    CREATE POLICY "Managers can manage expense categories" ON expense_categories_custom FOR ALL USING (get_user_role(bar_id) IN ('promoteur', 'gerant') OR is_super_admin());
  END IF;

  -- EXPENSES
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'expenses' AND policyname = 'Bar members can view expenses') THEN
    CREATE POLICY "Bar members can view expenses" ON expenses FOR SELECT USING (is_bar_member(bar_id) OR is_super_admin());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'expenses' AND policyname = 'Managers can manage expenses') THEN
    CREATE POLICY "Managers can manage expenses" ON expenses FOR ALL USING (get_user_role(bar_id) IN ('promoteur', 'gerant') OR is_super_admin());
  END IF;
END $$;

-- 9. Reload Schema Cache
NOTIFY pgrst, 'reload schema';
