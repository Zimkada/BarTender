-- Migration: Create capital_contributions table
-- Description: Store capital contributions/injections of funds
-- Author: Antigravity
-- Date: 2026-02-25

CREATE TABLE capital_contributions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bar_id UUID NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  source TEXT NOT NULL CHECK (source IN ('owner', 'partner', 'investor', 'loan', 'other')),
  source_details TEXT,
  description TEXT,
  contribution_date DATE NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(bar_id, contribution_date, source)
);

-- Indexes
CREATE INDEX idx_capital_contributions_bar ON capital_contributions(bar_id);
CREATE INDEX idx_capital_contributions_date ON capital_contributions(contribution_date);
CREATE INDEX idx_capital_contributions_source ON capital_contributions(source);

-- RLS Policy
ALTER TABLE capital_contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view capital contributions of their bars"
  ON capital_contributions FOR SELECT
  USING (
    bar_id IN (
      SELECT bar_id FROM bar_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Users can insert capital contributions for their bars"
  ON capital_contributions FOR INSERT
  WITH CHECK (
    bar_id IN (
      SELECT bar_id FROM bar_members
      WHERE user_id = auth.uid() AND is_active = true
    )
    AND created_by = auth.uid()
  );

CREATE POLICY "Users can update their own capital contributions"
  ON capital_contributions FOR UPDATE
  USING (
    created_by = auth.uid()
    AND bar_id IN (
      SELECT bar_id FROM bar_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Users can delete their own capital contributions"
  ON capital_contributions FOR DELETE
  USING (
    created_by = auth.uid()
    AND bar_id IN (
      SELECT bar_id FROM bar_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Permissions
GRANT SELECT ON capital_contributions TO authenticated;
GRANT INSERT ON capital_contributions TO authenticated;
GRANT UPDATE ON capital_contributions TO authenticated;
GRANT DELETE ON capital_contributions TO authenticated;
