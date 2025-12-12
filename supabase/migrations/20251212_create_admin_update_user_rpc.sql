-- RPC function for Super Admin to update any user
-- Bypasses RLS restrictions for admin operations

CREATE OR REPLACE FUNCTION admin_update_user(
    p_user_id UUID,
    p_name TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    username TEXT,
    email TEXT,
    name TEXT,
    phone TEXT,
    avatar_url TEXT,
    is_active BOOLEAN,
    first_login BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ
)
SECURITY DEFINER
AS $$
BEGIN
    -- Vérifier que seul un super_admin peut mettre à jour les utilisateurs
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin') THEN
        RAISE EXCEPTION 'Only super admin can update users';
    END IF;

    -- Update only the fields that are provided (not NULL)
    UPDATE users
    SET
        name = COALESCE(p_name, users.name),
        phone = COALESCE(p_phone, users.phone),
        email = COALESCE(p_email, users.email),
        is_active = COALESCE(p_is_active, users.is_active),
        updated_at = NOW()
    WHERE users.id = p_user_id;

    -- Return the updated user
    RETURN QUERY
    SELECT 
        u.id,
        u.username,
        u.email,
        u.name,
        u.phone,
        u.avatar_url,
        u.is_active,
        u.first_login,
        u.created_at,
        u.updated_at,
        u.last_login_at
    FROM users u
    WHERE u.id = p_user_id;
END;
$$ LANGUAGE plpgsql;
