-- Migration: Create initial_balances table
-- Description: Store opening balances for bars (migrated from localStorage)
-- Author: Zimkada
-- Date: 2026-02-25

CREATE TABLE initial_balances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bar_id UUID NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  date DATE NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_locked BOOLEAN NOT NULL DEFAULT false,

  -- Ensure only one initial balance per bar
  UNIQUE(bar_id)
);

-- Indexes
CREATE INDEX idx_initial_balances_bar ON initial_balances(bar_id);
CREATE INDEX idx_initial_balances_date ON initial_balances(date);

-- RLS Policy
ALTER TABLE initial_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view initial balance of their bars"
  ON initial_balances FOR SELECT
  USING (
    bar_id IN (
      SELECT bar_id FROM bar_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Users can insert initial balance for their bars"
  ON initial_balances FOR INSERT
  WITH CHECK (
    bar_id IN (
      SELECT bar_id FROM bar_members
      WHERE user_id = auth.uid() AND is_active = true
    )
    AND created_by = auth.uid()
  );

CREATE POLICY "Users can update initial balance of their bars"
  ON initial_balances FOR UPDATE
  USING (
    bar_id IN (
      SELECT bar_id FROM bar_members
      WHERE user_id = auth.uid() AND is_active = true
    )
    AND created_by = auth.uid()
    AND NOT is_locked
  );

CREATE POLICY "Users can delete initial balance of their bars"
  ON initial_balances FOR DELETE
  USING (
    bar_id IN (
      SELECT bar_id FROM bar_members
      WHERE user_id = auth.uid() AND is_active = true
    )
    AND created_by = auth.uid()
    AND NOT is_locked
  );

-- Permissions
GRANT SELECT ON initial_balances TO authenticated;
GRANT INSERT ON initial_balances TO authenticated;
GRANT UPDATE ON initial_balances TO authenticated;
GRANT DELETE ON initial_balances TO authenticated;
