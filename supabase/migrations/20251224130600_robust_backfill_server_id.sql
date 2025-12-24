-- MIGRATION: Robust backfill of server_id for existing sales in simplified mode
-- DATE: 2025-12-24
-- PURPOSE: BUG #6 Fix - Safely migrate existing simplified mode sales
--
-- Challenge: Sales created in simplified mode have server name in notes ("Serveur: Ahmed")
-- Goal: Extract name and map to user_id via server_name_mappings
-- Risk: Name extraction can fail due to typos, formatting inconsistencies
--
-- Solution: Create migration log for audit trail + graceful fallback

BEGIN;

-- ======================
-- STEP 1: Create audit log table
-- ======================
CREATE TABLE IF NOT EXISTS public.migration_server_id_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  bar_id UUID NOT NULL,
  notes TEXT,
  extracted_name TEXT,
  mapping_found BOOLEAN,
  fallback_used BOOLEAN,
  fallback_reason TEXT,
  server_id_before UUID,
  server_id_after UUID,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_migration_log_sale_id ON public.migration_server_id_log(sale_id);
CREATE INDEX IF NOT EXISTS idx_migration_log_bar_id ON public.migration_server_id_log(bar_id);
CREATE INDEX IF NOT EXISTS idx_migration_log_fallback ON public.migration_server_id_log(fallback_used);

-- ======================
-- STEP 2: Create safe extraction function
-- ======================
CREATE OR REPLACE FUNCTION extract_server_name_safe(p_notes TEXT)
RETURNS TEXT AS $$
BEGIN
  IF p_notes IS NULL OR p_notes = '' THEN
    RETURN NULL;
  END IF;

  -- Pattern: "Serveur: NAME" with optional leading/trailing spaces
  -- Matches: "Serveur: Ahmed", "Serveur:Ahmed ", " Serveur: Ahmed Mohamed", etc.
  RETURN TRIM(SUBSTRING(p_notes FROM 'Serveur:\s*(.*)$'));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ======================
-- STEP 3: Backfill with safe extraction + logging
-- ======================
DO $$
DECLARE
  v_sale RECORD;
  v_extracted_name TEXT;
  v_mapped_user_id UUID;
  v_fallback_used BOOLEAN := FALSE;
  v_fallback_reason TEXT;
  v_count_success INTEGER := 0;
  v_count_fallback INTEGER := 0;
  v_count_failed INTEGER := 0;
BEGIN
  RAISE NOTICE 'Starting server_id backfill for simplified mode sales...';

  FOR v_sale IN
    SELECT s.id, s.bar_id, s.created_by, s.notes, s.server_id
    FROM public.sales s
    JOIN public.bars b ON b.id = s.bar_id
    WHERE COALESCE(b.settings->>'operatingMode', 'full') = 'simplified'
      AND s.notes LIKE 'Serveur:%'
      AND s.server_id IS NULL
    ORDER BY s.created_at DESC
  LOOP
    -- Reset for each iteration
    v_extracted_name := NULL;
    v_mapped_user_id := NULL;
    v_fallback_used := FALSE;
    v_fallback_reason := NULL;

    -- Extract server name from notes
    v_extracted_name := extract_server_name_safe(v_sale.notes);

    IF v_extracted_name IS NULL OR v_extracted_name = '' THEN
      v_fallback_used := TRUE;
      v_fallback_reason := 'Extraction failed: Could not parse server name from notes';
      v_mapped_user_id := v_sale.created_by;
      v_count_fallback := v_count_fallback + 1;
    ELSE
      -- Try to find mapping
      SELECT user_id INTO v_mapped_user_id
      FROM public.server_name_mappings
      WHERE bar_id = v_sale.bar_id
        AND server_name = v_extracted_name
      LIMIT 1;

      IF v_mapped_user_id IS NULL THEN
        -- Mapping not found, use fallback
        v_fallback_used := TRUE;
        v_fallback_reason := 'Mapping not found: ' || v_extracted_name;
        v_mapped_user_id := v_sale.created_by;
        v_count_fallback := v_count_fallback + 1;
      ELSE
        v_count_success := v_count_success + 1;
      END IF;
    END IF;

    -- Update sale with mapped user_id (or fallback)
    IF v_mapped_user_id IS NOT NULL THEN
      UPDATE public.sales
      SET server_id = v_mapped_user_id
      WHERE id = v_sale.id;
    ELSE
      v_count_failed := v_count_failed + 1;
      v_fallback_reason := 'Fallback failed: Could not determine server';
    END IF;

    -- Log the operation for audit trail
    INSERT INTO public.migration_server_id_log (
      sale_id, bar_id, notes, extracted_name, mapping_found,
      fallback_used, fallback_reason, server_id_before, server_id_after
    ) VALUES (
      v_sale.id,
      v_sale.bar_id,
      v_sale.notes,
      v_extracted_name,
      (v_mapped_user_id IS NOT NULL AND NOT v_fallback_used),
      v_fallback_used,
      v_fallback_reason,
      v_sale.server_id,
      v_mapped_user_id
    );

  END LOOP;

  -- Summary
  RAISE NOTICE 'Backfill complete:';
  RAISE NOTICE '  - Successful mappings: %', v_count_success;
  RAISE NOTICE '  - Fallbacks used: %', v_count_fallback;
  RAISE NOTICE '  - Failed (no data): %', v_count_failed;
  RAISE NOTICE 'Check migration_server_id_log table for details on fallback cases.';

END $$;

-- ======================
-- STEP 4: Verify results
-- ======================
DO $$
DECLARE
  v_total_sales INTEGER;
  v_with_server_id INTEGER;
  v_without_server_id INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total_sales
  FROM public.sales s
  JOIN public.bars b ON b.id = s.bar_id
  WHERE COALESCE(b.settings->>'operatingMode', 'full') = 'simplified';

  SELECT COUNT(*) INTO v_with_server_id
  FROM public.sales s
  JOIN public.bars b ON b.id = s.bar_id
  WHERE COALESCE(b.settings->>'operatingMode', 'full') = 'simplified'
    AND s.server_id IS NOT NULL;

  v_without_server_id := v_total_sales - v_with_server_id;

  RAISE NOTICE '';
  RAISE NOTICE 'Verification:';
  RAISE NOTICE '  - Total simplified mode sales: %', v_total_sales;
  RAISE NOTICE '  - Sales with server_id: %', v_with_server_id;
  RAISE NOTICE '  - Sales without server_id: %', v_without_server_id;

  IF v_without_server_id > 0 THEN
    RAISE WARNING 'WARNING: % sales in simplified mode still have NULL server_id!', v_without_server_id;
    RAISE WARNING 'These servers may not see their sales. Check migration_server_id_log for details.';
  END IF;
END $$;

COMMIT;
