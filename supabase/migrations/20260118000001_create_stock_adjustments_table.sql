-- =====================================================
-- Migration: Create stock_adjustments table
-- Description: Track all manual stock adjustments with
--              full audit trail for inventory compliance
-- Date: 2026-01-18
-- =====================================================

BEGIN;

-- Create stock_adjustments table
CREATE TABLE IF NOT EXISTS stock_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bar_id UUID NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES bar_products(id) ON DELETE CASCADE,

  -- Stock tracking
  old_stock INTEGER NOT NULL CHECK (old_stock >= 0),
  new_stock INTEGER NOT NULL CHECK (new_stock >= 0),
  delta INTEGER NOT NULL,

  -- Reason & justification
  reason TEXT NOT NULL CHECK (reason IN (
    'inventory_count',
    'loss_damage',
    'donation_sample',
    'expiration',
    'theft_report',
    'other'
  )),
  notes TEXT,

  -- Audit trail
  adjusted_by UUID NOT NULL REFERENCES users(id),
  adjusted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_delta CHECK (
    (delta > 0 AND new_stock > old_stock) OR
    (delta < 0 AND new_stock < old_stock) OR
    (delta = 0 AND new_stock = old_stock)
  ),
  CONSTRAINT notes_required_for_other CHECK (
    reason != 'other' OR (notes IS NOT NULL AND notes != '')
  )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_bar_id
  ON stock_adjustments(bar_id);

CREATE INDEX IF NOT EXISTS idx_stock_adjustments_product_id
  ON stock_adjustments(product_id);

CREATE INDEX IF NOT EXISTS idx_stock_adjustments_adjusted_at
  ON stock_adjustments(adjusted_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_adjustments_adjusted_by
  ON stock_adjustments(adjusted_by);

-- Comment
COMMENT ON TABLE stock_adjustments IS 'Audit trail for all manual stock adjustments. Immutable records for compliance.';
COMMENT ON COLUMN stock_adjustments.delta IS 'Change in stock (positive or negative)';
COMMENT ON COLUMN stock_adjustments.reason IS 'Classification of adjustment reason for reporting';

COMMIT;
