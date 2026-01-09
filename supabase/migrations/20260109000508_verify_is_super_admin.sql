-- =====================================================
-- DIAGNOSTIC: Verify is_super_admin() function works
-- =====================================================
-- Purpose: Test if is_super_admin() returns TRUE for current user
-- If this shows FALSE, we have a problem with the function

BEGIN;

DO $$
DECLARE
    v_current_user UUID;
    v_is_super_admin BOOLEAN;
    v_auth_is_super_admin BOOLEAN;
    v_bar_members_count INT;
BEGIN
    -- Get current user
    SELECT auth.uid() INTO v_current_user;

    RAISE NOTICE '
    ╔════════════════════════════════════════════════════════════╗
    ║       VERIFY is_super_admin() FUNCTION                     ║
    ╚════════════════════════════════════════════════════════════╝
    ';

    RAISE NOTICE '[1] Current user ID: %', v_current_user;

    -- Test 1: Call is_super_admin() function
    SELECT is_super_admin() INTO v_is_super_admin;
    RAISE NOTICE '[2] is_super_admin() result: %', v_is_super_admin;

    -- Test 2: Check auth.users.is_super_admin directly
    SELECT is_super_admin FROM auth.users WHERE id = v_current_user
    INTO v_auth_is_super_admin;
    RAISE NOTICE '[3] auth.users.is_super_admin value: %', v_auth_is_super_admin;

    -- Test 3: Check if in bar_members as super_admin
    SELECT COUNT(*) INTO v_bar_members_count
    FROM bar_members
    WHERE user_id = v_current_user AND role = 'super_admin' AND is_active = true;
    RAISE NOTICE '[4] bar_members super_admin count: %', v_bar_members_count;

    -- Diagnostic
    RAISE NOTICE '
    ANALYSIS:
    ────────';

    IF v_is_super_admin THEN
        RAISE NOTICE '✅ is_super_admin() returned TRUE - Everything works!';
    ELSE
        RAISE NOTICE '❌ is_super_admin() returned FALSE - Problem detected:';

        IF v_auth_is_super_admin IS NULL THEN
            RAISE NOTICE '   → auth.users.is_super_admin is NULL';
            RAISE NOTICE '   → Need to SET is_super_admin = true in auth.users table';
        ELSIF v_auth_is_super_admin = FALSE THEN
            RAISE NOTICE '   → auth.users.is_super_admin is FALSE';
            RAISE NOTICE '   → Need to UPDATE auth.users SET is_super_admin = true';
        END IF;

        RAISE NOTICE '   → Current user is in bar_members as super_admin: %', v_bar_members_count > 0;
    END IF;

    RAISE NOTICE '';
END $$;

COMMIT;
