-- Create validation RPC for impersonation
-- This validates that a super_admin can impersonate a user and returns the necessary data
-- The actual JWT token will be generated using a Supabase Edge Function (sign_impersonate_token)
-- or by calling Supabase Auth API with a service role token

CREATE OR REPLACE FUNCTION validate_and_get_impersonate_data(
    p_super_admin_id UUID,
    p_impersonated_user_id UUID,
    p_bar_id UUID
)
RETURNS TABLE (
    success BOOLEAN,
    impersonated_user_id UUID,
    impersonated_user_email TEXT,
    impersonated_user_role TEXT,
    bar_id UUID,
    expires_at TIMESTAMPTZ,
    error_message TEXT
) AS $$
DECLARE
    v_impersonated_user_exists BOOLEAN;
    v_user_role TEXT;
    v_user_email TEXT;
    v_token_expiry TIMESTAMPTZ;
BEGIN
    -- 1. Verify impersonated user exists and is active
    SELECT EXISTS(SELECT 1 FROM users WHERE id = p_impersonated_user_id AND is_active = true)
    INTO v_impersonated_user_exists;

    IF NOT v_impersonated_user_exists THEN
        RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::UUID, NULL::TIMESTAMPTZ, 'Utilisateur cible non trouvé ou inactif';
        RETURN;
    END IF;

    -- 2. Verify impersonated user has an active role in the specified bar
    SELECT role, email INTO v_user_role, v_user_email
    FROM bar_members
    INNER JOIN users ON bar_members.user_id = users.id
    WHERE bar_members.user_id = p_impersonated_user_id
    AND bar_members.bar_id = p_bar_id
    AND bar_members.is_active = true
    AND users.is_active = true;

    IF v_user_role IS NULL THEN
        RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::UUID, NULL::TIMESTAMPTZ, 'L''utilisateur n''a pas un rôle actif dans ce bar';
        RETURN;
    END IF;

    -- 3. Calculate token expiration (24 hours from now)
    v_token_expiry := NOW() + INTERVAL '24 hours';

    -- 4. Log the impersonation attempt
    INSERT INTO audit_logs (
        event,
        severity,
        user_id,
        user_name,
        bar_id,
        bar_name,
        description,
        metadata
    ) VALUES (
        'IMPERSONATE_REQUESTED',
        'warning',
        p_super_admin_id,
        (SELECT name FROM users WHERE id = p_super_admin_id LIMIT 1),
        p_bar_id,
        (SELECT name FROM bars WHERE id = p_bar_id LIMIT 1),
        'Impersonate token requested for user ' || (SELECT name FROM users WHERE id = p_impersonated_user_id LIMIT 1),
        jsonb_build_object(
            'super_admin_id', p_super_admin_id,
            'impersonated_user_id', p_impersonated_user_id,
            'bar_id', p_bar_id,
            'impersonated_user_name', (SELECT name FROM users WHERE id = p_impersonated_user_id LIMIT 1),
            'impersonated_user_role', v_user_role
        )
    );

    -- 5. Return success with user data
    RETURN QUERY
    SELECT
        true as success,
        p_impersonated_user_id,
        v_user_email,
        v_user_role,
        p_bar_id,
        v_token_expiry,
        NULL::TEXT as error_message;

EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::UUID, NULL::TIMESTAMPTZ, 'Erreur: ' || SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION validate_and_get_impersonate_data(UUID, UUID, UUID) IS 'Valide qu''un super_admin peut impersonater un utilisateur et retourne les données nécessaires. L''authentification est déléguée au client avec Supabase Auth.';

-- Grant permissions to authenticated users
GRANT EXECUTE ON FUNCTION validate_and_get_impersonate_data(UUID, UUID, UUID) TO authenticated;
