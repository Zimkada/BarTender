-- =====================================================
-- BACKFILL IDEMPOTENCE TEST SCRIPT
-- =====================================================
-- Date: 2026-02-23
-- Purpose: Validate Bug #7 Fix (Backfill must be idempotent)
-- Run in: Supabase SQL Editor
-- =====================================================

DO $$
DECLARE
  v_owner_id_1 UUID;
  v_owner_id_2 UUID;
  v_owner_id_3 UUID;
  v_bar_id_1 UUID;
  v_bar_id_2 UUID;
  v_bar_id_3 UUID;
  v_operating_mode_1 TEXT;
  v_operating_mode_2 TEXT;
  v_operating_mode_3 TEXT;
  v_result TEXT;
  v_error_msg TEXT;
BEGIN
  -- 1. SETUP: Create test users and three test bars with different operating_mode_at_creation values

  -- Create test owners
  v_owner_id_1 := gen_random_uuid();
  v_owner_id_2 := gen_random_uuid();
  v_owner_id_3 := gen_random_uuid();

  INSERT INTO public.users (id, username, name, phone, is_active) VALUES (v_owner_id_1, 'owner1_' || substr(v_owner_id_1::text, 1, 8), 'Owner 1', '+229 10000000', true);
  INSERT INTO public.users (id, username, name, phone, is_active) VALUES (v_owner_id_2, 'owner2_' || substr(v_owner_id_2::text, 1, 8), 'Owner 2', '+229 20000000', true);
  INSERT INTO public.users (id, username, name, phone, is_active) VALUES (v_owner_id_3, 'owner3_' || substr(v_owner_id_3::text, 1, 8), 'Owner 3', '+229 30000000', true);

  -- Bar 1: Will have operating_mode_at_creation = NULL (should be backfilled to 'full')
  INSERT INTO public.bars (name, owner_id, operating_mode_at_creation)
  VALUES ('Test Bar Alpha (NULL)', v_owner_id_1, NULL) RETURNING id INTO v_bar_id_1;

  -- Bar 2: Already has 'simplified' (should NOT be overwritten during backfill)
  INSERT INTO public.bars (name, owner_id, operating_mode_at_creation)
  VALUES ('Test Bar Beta (simplified)', v_owner_id_2, 'simplified') RETURNING id INTO v_bar_id_2;

  -- Bar 3: Already has 'full' (should NOT be overwritten during backfill)
  INSERT INTO public.bars (name, owner_id, operating_mode_at_creation)
  VALUES ('Test Bar Gamma (full)', v_owner_id_3, 'full') RETURNING id INTO v_bar_id_3;

  -- 2. EXECUTION - FIRST RUN: Simulate the migration backfill
  -- This should only update Bar 1 (where operating_mode_at_creation IS NULL)

  BEGIN
    UPDATE public.bars
    SET operating_mode_at_creation = 'full'
    WHERE operating_mode_at_creation IS NULL;

    -- Verify results after first run
    SELECT operating_mode_at_creation INTO v_operating_mode_1 FROM public.bars WHERE id = v_bar_id_1;
    SELECT operating_mode_at_creation INTO v_operating_mode_2 FROM public.bars WHERE id = v_bar_id_2;
    SELECT operating_mode_at_creation INTO v_operating_mode_3 FROM public.bars WHERE id = v_bar_id_3;

    IF v_operating_mode_1 = 'full' AND
       v_operating_mode_2 = 'simplified' AND
       v_operating_mode_3 = 'full' THEN
      v_result := 'PASS ✅ - First run: Bar 1 updated to full, Bar 2 and 3 unchanged.';
    ELSE
      v_result := 'FAIL ❌ - First run: Unexpected values. Bar1=' || COALESCE(v_operating_mode_1, 'NULL') ||
                  ', Bar2=' || COALESCE(v_operating_mode_2, 'NULL') || ', Bar3=' || COALESCE(v_operating_mode_3, 'NULL');
    END IF;

  EXCEPTION WHEN OTHERS THEN
    v_error_msg := SQLERRM;
    v_result := 'FAIL ❌ - First run exception: ' || v_error_msg;
  END;

  -- 3. EXECUTION - SECOND RUN: Simulate re-running the migration (IDEMPOTENCE TEST)
  -- This should NOT change ANY values (idempotent operation)

  BEGIN
    -- Run the same UPDATE query again
    UPDATE public.bars
    SET operating_mode_at_creation = 'full'
    WHERE operating_mode_at_creation IS NULL;

    -- Verify results after second run (should be identical to first run)
    SELECT operating_mode_at_creation INTO v_operating_mode_1 FROM public.bars WHERE id = v_bar_id_1;
    SELECT operating_mode_at_creation INTO v_operating_mode_2 FROM public.bars WHERE id = v_bar_id_2;
    SELECT operating_mode_at_creation INTO v_operating_mode_3 FROM public.bars WHERE id = v_bar_id_3;

    -- Check if values remain unchanged (idempotent)
    IF v_operating_mode_1 = 'full' AND
       v_operating_mode_2 = 'simplified' AND
       v_operating_mode_3 = 'full' THEN
      v_result := v_result || ' | PASS ✅ - Second run (Idempotent): All values unchanged. Bug #7 is fixed.';
    ELSE
      v_result := v_result || ' | FAIL ❌ - Second run: Values changed unexpectedly. Bar1=' || COALESCE(v_operating_mode_1, 'NULL') ||
                  ', Bar2=' || COALESCE(v_operating_mode_2, 'NULL') || ', Bar3=' || COALESCE(v_operating_mode_3, 'NULL');
    END IF;

  EXCEPTION WHEN OTHERS THEN
    v_error_msg := SQLERRM;
    v_result := v_result || ' | FAIL ❌ - Second run exception: ' || v_error_msg;
  END;

  -- 4. TEARDOWN: Clean up test data
  DELETE FROM public.bars WHERE id IN (v_bar_id_1, v_bar_id_2, v_bar_id_3);
  DELETE FROM public.users WHERE id IN (v_owner_id_1, v_owner_id_2, v_owner_id_3);

  -- 5. REPORT
  RAISE NOTICE '=====================================================';
  RAISE NOTICE 'BACKFILL IDEMPOTENCE TEST RESULT:';
  RAISE NOTICE '%', v_result;
  RAISE NOTICE '=====================================================';

END $$;
