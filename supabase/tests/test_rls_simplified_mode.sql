-- =====================================================
-- RLS VALIDATION TEST SCRIPT : SIMPLIFIED MODE FIX
-- =====================================================
-- Date: 2026-02-23
-- Purpose: Validate Bug #2 Fix (RLS LIMIT 1 -> EXISTS)
-- Run in: Supabase SQL Editor
-- =====================================================

DO $$
DECLARE
  v_user_gerant_id UUID;
  v_bar1_id UUID;
  v_bar2_id UUID;
  v_sale1_id UUID;
  v_sale2_id UUID;
  v_result TEXT;
  v_error_msg TEXT;
BEGIN
  -- 1. SETUP: Create a temporary test manager and two bars
  
  -- Create Gérant
  v_user_gerant_id := gen_random_uuid();
  INSERT INTO auth.users (id, email) VALUES (v_user_gerant_id, 'test_multi_bar_gerant@bartender.local');
  INSERT INTO public.users (id, full_name, role) VALUES (v_user_gerant_id, 'Test Gérant Multi-Bar', 'gerant');

  -- Create Bar 1
  INSERT INTO public.bars (name, owner_id) VALUES ('Test Bar Alpha', v_user_gerant_id) RETURNING id INTO v_bar1_id;
  
  -- Create Bar 2
  INSERT INTO public.bars (name, owner_id) VALUES ('Test Bar Beta', v_user_gerant_id) RETURNING id INTO v_bar2_id;

  -- Add Gérant to both bars
  INSERT INTO public.bar_members (bar_id, user_id, role, is_active) VALUES (v_bar1_id, v_user_gerant_id, 'gerant', true);
  INSERT INTO public.bar_members (bar_id, user_id, role, is_active) VALUES (v_bar2_id, v_user_gerant_id, 'gerant', true);

  -- Create a pending sale in Bar 1
  INSERT INTO public.sales (bar_id, status, total_amount, idempotency_key, created_by) 
  VALUES (v_bar1_id, 'pending', 1000, gen_random_uuid(), v_user_gerant_id) RETURNING id INTO v_sale1_id;

  -- Create a pending sale in Bar 2
  INSERT INTO public.sales (bar_id, status, total_amount, idempotency_key, created_by) 
  VALUES (v_bar2_id, 'pending', 2000, gen_random_uuid(), v_user_gerant_id) RETURNING id INTO v_sale2_id;

  -- 2. EXECUTION: Simulate RLS validation as the Gérant

  -- Set context to the authenticated gerant
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', v_user_gerant_id), true);

  BEGIN
    -- Try to validate sale in Bar 1
    UPDATE public.sales SET status = 'validated' WHERE id = v_sale1_id;
    
    -- Try to validate sale in Bar 2
    UPDATE public.sales SET status = 'validated' WHERE id = v_sale2_id;

    -- Verify both were validated
    IF (SELECT status FROM public.sales WHERE id = v_sale1_id) = 'validated' AND 
       (SELECT status FROM public.sales WHERE id = v_sale2_id) = 'validated' THEN
        v_result := 'PASS ✅ - Multi-bar RLS Validation successful. Bug #2 is fixed.';
    ELSE
        v_result := 'FAIL ❌ - One or both sales were not updated. RLS policy blocked the action.';
    END IF;

  EXCEPTION WHEN OTHERS THEN
    v_error_msg := SQLERRM;
    v_result := 'FAIL ❌ - RLS Exception: ' || v_error_msg;
  END;

  -- 3. TEARDOWN: Clean up test data
  -- Reset role to postgres superuser to bypass RLS for cleanup
  PERFORM set_config('role', 'postgres', true);
  
  DELETE FROM public.sales WHERE id IN (v_sale1_id, v_sale2_id);
  DELETE FROM public.bar_members WHERE user_id = v_user_gerant_id;
  DELETE FROM public.bars WHERE id IN (v_bar1_id, v_bar2_id);
  DELETE FROM public.users WHERE id = v_user_gerant_id;
  DELETE FROM auth.users WHERE id = v_user_gerant_id;

  -- 4. REPORT
  RAISE NOTICE '=====================================================';
  RAISE NOTICE 'RLS SIMPLIFIED MODE TEST RESULT:';
  RAISE NOTICE '%', v_result;
  RAISE NOTICE '=====================================================';

END $$;
