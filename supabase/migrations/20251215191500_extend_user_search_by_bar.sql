-- Migration: Extension de la recherche utilisateur pour inclure le nom du bar.
-- Date: 2025-12-15 19:15:00
-- Description: Modifie la fonction RPC 'get_paginated_users' pour permettre la recherche par nom de bar.

DROP FUNCTION IF EXISTS get_paginated_users(INT, INT, TEXT, TEXT) CASCADE;

CREATE OR REPLACE FUNCTION get_paginated_users(
    p_page INT,
    p_limit INT,
    p_search_query TEXT DEFAULT '',
    p_role_filter TEXT DEFAULT 'all'
)
RETURNS TABLE (users JSONB, total_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  is_super_admin BOOLEAN := FALSE;
BEGIN
  -- Vérification de sécurité: Seuls les super admins peuvent exécuter cette fonction.
  SELECT EXISTS (
    SELECT 1 FROM public.bar_members
    WHERE user_id = current_user_id AND role = 'super_admin' AND is_active = TRUE
  ) INTO is_super_admin;

  IF NOT is_super_admin THEN
    RAISE EXCEPTION 'Permission denied: only super admins can execute get_paginated_users.';
  END IF;

    RETURN QUERY
    WITH user_roles_and_bars AS (
        SELECT
            u.id,
            u.username,
            u.name,
            u.phone,
            u.email,
            u.created_at,
            u.is_active,
            u.first_login,
            u.last_login_at,
            COALESCE(
                jsonb_agg(DISTINCT bm.role) FILTER (WHERE bm.role IS NOT NULL AND bm.is_active = true),
                '[]'::jsonb
            ) AS roles,
            COALESCE(
                jsonb_agg(DISTINCT jsonb_build_object('id', b.id, 'name', b.name))
                FILTER (WHERE b.id IS NOT NULL AND bm.is_active = true),
                '[]'::jsonb
            ) AS bars
        FROM users u
        LEFT JOIN bar_members bm ON bm.user_id = u.id
        LEFT JOIN bars b ON bm.bar_id = b.id
        WHERE
            (p_search_query = '' OR
             u.username ILIKE '%' || p_search_query || '%' OR
             u.name ILIKE '%' || p_search_query || '%' OR
             u.email ILIKE '%' || p_search_query || '%' OR
             b.name ILIKE '%' || p_search_query || '%') -- Ajout de la recherche par nom de bar
        GROUP BY u.id
    ),
    filtered_users AS (
        SELECT *
        FROM user_roles_and_bars
        WHERE
            (p_role_filter = 'all' OR roles ? p_role_filter)
    )
    SELECT
        (
            SELECT jsonb_agg(f)
            FROM (
                SELECT *
                FROM filtered_users
                ORDER BY created_at DESC
                LIMIT p_limit
                OFFSET (p_page - 1) * p_limit
            ) f
        ) AS users,
        (SELECT COUNT(*) FROM filtered_users) AS total_count;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_paginated_users(INT, INT, TEXT, TEXT) TO authenticated;

-- Add a comment to explain the function
COMMENT ON FUNCTION get_paginated_users(INT, INT, TEXT, TEXT) IS
'Get a paginated list of users with their roles and bar associations.
**SECURITY**: Only super admins can execute this function.
Supports search by username/name/email/bar name and filtering by role.';

-- Notifier Supabase de recharger le schéma pour PostgREST
NOTIFY pgrst, 'reload schema';
