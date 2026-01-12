-- Create atomic RPC function for completing bar onboarding
-- This function consolidates all onboarding operations into a single transaction
-- Prevents partial failures and improves performance (single DB roundtrip)

CREATE OR REPLACE FUNCTION public.complete_bar_onboarding(
  p_bar_id uuid,
  p_owner_id uuid,
  p_operating_mode text DEFAULT 'simplifié'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_response jsonb;
  v_error_message text;
BEGIN
  -- Validate inputs
  IF p_bar_id IS NULL OR p_owner_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Missing required parameters: p_bar_id and p_owner_id',
      'timestamp', now()
    );
  END IF;

  -- Verify ownership
  IF NOT EXISTS (SELECT 1 FROM bars WHERE id = p_bar_id AND owner_id = p_owner_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: Bar not owned by user',
      'timestamp', now()
    );
  END IF;

  BEGIN
    -- ATOMIC TRANSACTION: All operations succeed or all rollback

    -- 1. Verify bar has required data
    -- (This is a verification step, not a modification)
    IF NOT EXISTS (
      SELECT 1 FROM bars
      WHERE id = p_bar_id
      AND name IS NOT NULL
      AND location IS NOT NULL
      AND closing_hour IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Bar details incomplete (name, location, or closing_hour missing)';
    END IF;

    -- 2. Verify at least 1 product exists
    IF NOT EXISTS (SELECT 1 FROM bar_products WHERE bar_id = p_bar_id LIMIT 1) THEN
      RAISE EXCEPTION 'No products added to bar';
    END IF;

    -- 3. Verify stock initialized for products
    IF NOT EXISTS (SELECT 1 FROM supplies WHERE bar_id = p_bar_id LIMIT 1) THEN
      RAISE EXCEPTION 'No stock initialized';
    END IF;

    -- 4. Update operating mode if provided
    IF p_operating_mode IS NOT NULL AND p_operating_mode != '' THEN
      UPDATE bars
      SET operating_mode = p_operating_mode::bar_operating_mode
      WHERE id = p_bar_id;
    END IF;

    -- 5. Mark setup as complete (ATOMIC LAUNCH)
    UPDATE bars
    SET
      is_setup_complete = true,
      setup_completed_at = now()
    WHERE id = p_bar_id;

    -- 6. Log audit event (using trigger, not here)
    -- The audit triggers will capture this update automatically

    -- Success response
    RETURN jsonb_build_object(
      'success', true,
      'bar_id', p_bar_id,
      'completed_at', now(),
      'message', 'Bar onboarding completed successfully',
      'timestamp', now()
    );

  EXCEPTION WHEN OTHERS THEN
    -- Capture error and return it
    v_error_message := SQLERRM;
    RETURN jsonb_build_object(
      'success', false,
      'error', v_error_message,
      'bar_id', p_bar_id,
      'timestamp', now()
    );
  END;
END;
$$;

-- Grant permission to authenticated users
GRANT EXECUTE ON FUNCTION public.complete_bar_onboarding TO authenticated;

-- Create index for performance on bars table (if not exists)
-- These help with the verification queries above
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_bars_owner_id') THEN
    CREATE INDEX idx_bars_owner_id ON public.bars(owner_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_bar_products_bar_id') THEN
    CREATE INDEX idx_bar_products_bar_id ON public.bar_products(bar_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_supplies_bar_id') THEN
    CREATE INDEX idx_supplies_bar_id ON public.supplies(bar_id);
  END IF;
END $$;

-- Comment for documentation
COMMENT ON FUNCTION public.complete_bar_onboarding(uuid, uuid, text) IS
'Atomically complete bar onboarding process.
Consolidates multiple operations (verify details, update mode, mark complete) into single transaction.
Returns JSONB with success/error status and timestamp.
Prevents duplicate entries and improves reliability over multiple sequential API calls.';
