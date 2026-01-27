-- Fix critical errors in complete_bar_onboarding RPC
-- 1. Uses 'address' instead of 'location'
-- 2. Updates 'operatingMode' inside 'settings' JSONB (since the column and type don't exist)
-- 3. Implements role-neutral verification

CREATE OR REPLACE FUNCTION public.complete_bar_onboarding(
  p_bar_id uuid,
  p_owner_id uuid, -- This should be the currentBar.owner_id passed by the frontend
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
  v_final_mode text;
BEGIN
  -- Validate inputs
  IF p_bar_id IS NULL OR p_owner_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Missing required parameters: p_bar_id and p_owner_id',
      'timestamp', now()
    );
  END IF;

  -- Verify ownership (security check)
  IF NOT EXISTS (SELECT 1 FROM bars WHERE id = p_bar_id AND owner_id = p_owner_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: User is not the owner of this bar',
      'timestamp', now()
    );
  END IF;

  BEGIN
    -- ATOMIC TRANSACTION

    -- 1. Verify bar has required basic data (name, address, closing_hour)
    IF NOT EXISTS (
      SELECT 1 FROM bars
      WHERE id = p_bar_id
      AND name IS NOT NULL
      AND address IS NOT NULL
      AND closing_hour IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Données du bar incomplètes (Nom, Adresse ou Heure de clôture manquante)';
    END IF;

    -- 2. Verify at least 1 product exists
    IF NOT EXISTS (SELECT 1 FROM bar_products WHERE bar_id = p_bar_id AND is_active = true LIMIT 1) THEN
      RAISE EXCEPTION 'Aucun produit n''a été ajouté au bar';
    END IF;

    -- 3. Verify stock initialized (Check supplies table OR products with stock > 0)
    IF NOT EXISTS (SELECT 1 FROM supplies WHERE bar_id = p_bar_id LIMIT 1) 
       AND NOT EXISTS (SELECT 1 FROM bar_products WHERE bar_id = p_bar_id AND stock > 0 LIMIT 1) THEN
      RAISE EXCEPTION 'Le stock initial n''a pas été configuré';
    END IF;

    -- 4. Map operating mode to DB format ('full' remains, 'simplifié' becomes 'simplified')
    v_final_mode := CASE 
      WHEN p_operating_mode = 'simplifié' THEN 'simplified'
      WHEN p_operating_mode = 'simplified' THEN 'simplified'
      ELSE 'full'
    END;

    -- 5. Update settings JSONB and mark as complete
    UPDATE bars
    SET
      settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object('operatingMode', v_final_mode),
      is_setup_complete = true,
      setup_completed_at = now()
    WHERE id = p_bar_id;

    -- Success response
    RETURN jsonb_build_object(
      'success', true,
      'bar_id', p_bar_id,
      'completed_at', now(),
      'message', 'Onboarding terminé avec succès',
      'timestamp', now()
    );

  EXCEPTION WHEN OTHERS THEN
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
