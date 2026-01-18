-- =====================================================
-- Migration: Add Performance Indexes for stock_adjustments
-- Description: Optimize queries on stock_adjustments table
-- Date: 2026-01-18
-- =====================================================

BEGIN;

-- Index for querying adjustments by bar (most common query)
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_bar_id_adjusted_at
  ON stock_adjustments(bar_id, adjusted_at DESC);

-- Index for querying adjustments by product (product history)
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_product_id_adjusted_at
  ON stock_adjustments(product_id, adjusted_at DESC);

-- Index for querying adjustments by user (audit trail)
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_adjusted_by
  ON stock_adjustments(adjusted_by);

-- Index for filtering by reason (reporting)
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_reason
  ON stock_adjustments(reason);

-- Composite index for common query pattern: bar + reason + date
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_bar_reason_date
  ON stock_adjustments(bar_id, reason, adjusted_at DESC);

COMMENT ON INDEX idx_stock_adjustments_bar_id_adjusted_at IS 'Optimize queries: get all adjustments for a bar ordered by date';
COMMENT ON INDEX idx_stock_adjustments_product_id_adjusted_at IS 'Optimize queries: get adjustment history for a specific product';
COMMENT ON INDEX idx_stock_adjustments_adjusted_by IS 'Optimize queries: audit trail by user';
COMMENT ON INDEX idx_stock_adjustments_reason IS 'Optimize queries: filter/report by reason';
COMMENT ON INDEX idx_stock_adjustments_bar_reason_date IS 'Optimize queries: bar-specific reports by reason and date';

COMMIT;
