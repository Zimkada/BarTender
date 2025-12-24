-- MIGRATION: Fix Promotion Analytics to use business_date
-- DATE: 2025-12-24
-- REASON: The promotion analytics functions were using `applied_at` (a raw timestamp),
-- which is inconsistent with the rest of the app that uses a `business_date` logic
-- (e.g., a day runs from 6am to 6am). This caused discrepancies where sales with
-- promotions were not appearing in the analytics dashboard.
-- This migration harmonizes the logic by making promotion analytics "business date aware".

BEGIN;

-- =====================================================
-- STEP 1: Add business_date column to promotion_applications
-- =====================================================
ALTER TABLE public.promotion_applications
ADD COLUMN IF NOT EXISTS business_date DATE;

COMMENT ON COLUMN public.promotion_applications.business_date IS 'The business date on which the promotion was applied, synced from the parent sale record.';


-- =====================================================
-- STEP 2: Backfill business_date for existing records
-- =====================================================
UPDATE public.promotion_applications pa
SET business_date = s.business_date
FROM public.sales s
WHERE pa.sale_id = s.id AND pa.business_date IS NULL;


-- =====================================================
-- STEP 3: Create trigger function to auto-populate business_date
-- =====================================================
CREATE OR REPLACE FUNCTION public.sync_promotion_business_date()
RETURNS TRIGGER AS $$
BEGIN
  -- On a new promotion application, copy the business_date from the parent sale record.
  -- This ensures consistency between sales data and promotion analytics.
  IF NEW.business_date IS NULL AND NEW.sale_id IS NOT NULL THEN
    SELECT s.business_date INTO NEW.business_date
    FROM public.sales s
    WHERE s.id = NEW.sale_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.sync_promotion_business_date() IS 'Trigger function to automatically populate the business_date on a new promotion_application record by copying it from the associated sale.';

-- Drop any existing trigger to ensure idempotency before creating a new one.
DROP TRIGGER IF EXISTS trg_sync_promotion_business_date ON public.promotion_applications;

-- Create the trigger to execute the function before each insert.
CREATE TRIGGER trg_sync_promotion_business_date
BEFORE INSERT ON public.promotion_applications
FOR EACH ROW
EXECUTE FUNCTION public.sync_promotion_business_date();


-- =====================================================
-- STEP 4: Update RPC functions to use business_date
-- =====================================================

-- 4.1: get_bar_global_promotion_stats
CREATE OR REPLACE FUNCTION get_bar_global_promotion_stats(
  p_bar_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  total_revenue DECIMAL,
  total_discount DECIMAL,
  total_applications BIGINT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(pa.discounted_price), 0) as total_revenue,
    COALESCE(SUM(pa.discount_amount), 0) as total_discount,
    COUNT(pa.id)::BIGINT as total_applications
  FROM public.promotion_applications pa
  WHERE pa.bar_id = p_bar_id
    -- MODIFIED: Use business_date for filtering. Cast TIMESTAMPTZ to DATE for correct comparison.
    AND (p_start_date IS NULL OR pa.business_date >= p_start_date::DATE)
    AND (p_end_date IS NULL OR pa.business_date <= p_end_date::DATE);
END;
$$;

-- 4.2: get_bar_promotion_stats
CREATE OR REPLACE FUNCTION get_bar_promotion_stats(
  p_bar_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  promotion_id UUID,
  promotion_name TEXT,
  total_applications BIGINT,
  total_revenue DECIMAL,
  total_discount DECIMAL
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id as promotion_id,
    p.name as promotion_name,
    COUNT(pa.id)::BIGINT as total_applications,
    COALESCE(SUM(pa.discounted_price), 0) as total_revenue,
    COALESCE(SUM(pa.discount_amount), 0) as total_discount
  FROM public.promotions p
  LEFT JOIN public.promotion_applications pa ON p.id = pa.promotion_id
    -- MODIFIED: Join condition is cleaner, filtering is now in the WHERE clause
    AND p.bar_id = pa.bar_id
  WHERE p.bar_id = p_bar_id
    -- MODIFIED: Filtering now uses business_date.
    AND (p_start_date IS NULL OR pa.business_date >= p_start_date::DATE)
    AND (p_end_date IS NULL OR pa.business_date <= p_end_date::DATE)
  GROUP BY p.id, p.name
  ORDER BY total_revenue DESC;
END;
$$;

-- =====================================================
-- STEP 5: Add index for performance
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_promo_apps_business_date ON public.promotion_applications(bar_id, business_date DESC);
COMMENT ON INDEX idx_promo_apps_business_date IS 'Improves performance of promotion analytics queries filtered by business_date.';

COMMIT;
