-- =====================================================
-- SÉCURITÉ — Vague 1 : fermer les fuites les plus graves des RPC SECURITY DEFINER
-- =====================================================
-- Date : 2026-06-23
-- Contexte : audit + contre-audit du 13/06 + certification prod du 23/06.
--   Toutes les fonctions ont owner = postgres → SECURITY DEFINER bypasse la RLS.
--   Le pari historique « let RLS handle it » est donc faux : plusieurs RPC admin
--   sont en réalité ouvertes (certaines à anon).
--
-- Principe : recréation À L'IDENTIQUE (signature, types de retour, corps) à la
--   seule exception du contrôle d'accès ajouté / de la branche impersonation retirée.
--   → zéro changement de comportement pour l'usage légitime (super_admin / membre du bar).
--
-- Portée Vague 1 (risque ~nul) :
--   1. DROP validate_and_get_impersonate_data  (code mort — impersonation abandonnée)
--   2. get_paginated_audit_logs                (REVOKE anon + guard super_admin)
--   3. get_paginated_catalog_logs_for_admin    (REVOKE anon + guard + revoke table anon)
--   4. get_bar_products                        (retrait branche JWT impersonation)
--   5. get_bar_members                         (retrait branche JWT impersonation)
--
-- NB : is_super_admin() est SECURITY DEFINER et lit auth.users.is_super_admin
--   (corrigé le 09/01, migration 20260109000503) → le guard laisse passer le
--   super_admin même s'il n'est pas dans bar_members (architecture system bar).
-- =====================================================

BEGIN;

-- =====================================================
-- 1. DROP validate_and_get_impersonate_data (code mort)
-- =====================================================
-- L'Edge Function sign-impersonate-token n'est plus déployée (vérifié 23/06)
-- et le flag impersonation côté client est neutralisé (impersonatingUserId = undefined).
-- Cette fonction n'avait aucun guard : retournait email/rôle d'un user cible
-- arbitraire + écrivait un faux log d'impersonation. On la supprime.

DROP FUNCTION IF EXISTS validate_and_get_impersonate_data(UUID, UUID, UUID);

-- =====================================================
-- 2. get_paginated_audit_logs — guard super_admin + revoke anon
-- =====================================================
-- État précédent (20260109000507) : SECURITY DEFINER + GRANT anon + « let RLS handle it ».
-- Comme SECURITY DEFINER bypasse la RLS, l'historique d'audit était lisible sans guard,
-- y compris par anon. On ajoute un guard explicite et on retire le GRANT anon.

CREATE OR REPLACE FUNCTION get_paginated_audit_logs(
    p_page INT,
    p_limit INT,
    p_search_query TEXT DEFAULT '',
    p_severity_filter TEXT DEFAULT 'all',
    p_event_filter TEXT DEFAULT 'all',
    p_bar_filter TEXT DEFAULT 'all',
    p_start_date TEXT DEFAULT NULL,
    p_end_date TEXT DEFAULT NULL
)
RETURNS TABLE (
    logs JSON,
    total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    -- 🛡️ Guard explicite : seul un super_admin peut lire l'audit global.
    IF NOT is_super_admin() THEN
        RAISE EXCEPTION 'Access denied: super_admin required' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    WITH filtered_logs AS (
        SELECT *
        FROM public.audit_logs
        WHERE
            (p_search_query = ''
             OR description ILIKE '%' || p_search_query || '%'
             OR user_name ILIKE '%' || p_search_query || '%'
             OR bar_name ILIKE '%' || p_search_query || '%')
            AND (p_severity_filter = 'all' OR severity::text = p_severity_filter)
            AND (p_event_filter = 'all' OR event::text = p_event_filter)
            AND (p_bar_filter = 'all'
                 OR (p_bar_filter = 'system' AND bar_id IS NULL)
                 OR bar_id::text = p_bar_filter)
            AND (p_start_date IS NULL OR "timestamp" >= p_start_date::timestamp)
            AND (p_end_date IS NULL OR "timestamp" <= (p_end_date::timestamp + interval '1 day'))
    )
    SELECT
        (SELECT json_agg(fl.* ORDER BY fl."timestamp" DESC) FROM (
            SELECT * FROM filtered_logs
            ORDER BY "timestamp" DESC
            LIMIT p_limit
            OFFSET (p_page - 1) * p_limit
        ) fl) AS logs,
        (SELECT COUNT(*) FROM filtered_logs) AS total_count;
END;
$$;

-- ⚠️ REVOKE FROM PUBLIC (pas seulement anon) : EXECUTE est accordé à PUBLIC par
-- défaut à la création d'une fonction → anon en hérite. Révoquer anon seul ne
-- suffit pas. On retire PUBLIC, puis on re-grant explicitement authenticated.
REVOKE EXECUTE ON FUNCTION get_paginated_audit_logs(
    INT, INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION get_paginated_audit_logs(
    INT, INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM anon;

GRANT EXECUTE ON FUNCTION get_paginated_audit_logs(
    INT, INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;

-- =====================================================
-- 3. get_paginated_catalog_logs_for_admin — guard + revoke anon (RPC ET table)
-- =====================================================
-- État précédent (20260109000506) : SECURITY DEFINER + GRANT anon sur la RPC
-- ET GRANT SELECT/INSERT ON TABLE global_catalog_audit_log TO anon.
-- Double fuite anon. On garde l'accès super_admin uniquement.

CREATE OR REPLACE FUNCTION get_paginated_catalog_logs_for_admin(
    p_page INT,
    p_limit INT,
    p_search_query TEXT DEFAULT '',
    p_action_filter TEXT DEFAULT NULL,
    p_entity_filter TEXT DEFAULT NULL,
    p_start_date TEXT DEFAULT NULL,
    p_end_date TEXT DEFAULT NULL
)
RETURNS TABLE(
    id UUID,
    action TEXT,
    entity_type TEXT,
    entity_id UUID,
    entity_name TEXT,
    old_values JSONB,
    new_values JSONB,
    modified_by UUID,
    created_at TIMESTAMPTZ,
    total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_offset INT;
BEGIN
    -- 🛡️ Guard explicite : seul un super_admin peut lire l'audit du catalogue global.
    IF NOT is_super_admin() THEN
        RAISE EXCEPTION 'Access denied: super_admin required' USING ERRCODE = '42501';
    END IF;

    IF p_page < 1 THEN
        v_offset := 0;
    ELSE
        v_offset := (p_page - 1) * COALESCE(p_limit, 50);
    END IF;

    RETURN QUERY
    WITH filtered_logs AS (
        SELECT
            l.id,
            l.action,
            l.entity_type,
            l.entity_id,
            l.entity_name,
            l.old_values,
            l.new_values,
            l.modified_by,
            l.created_at
        FROM public.global_catalog_audit_log l
        WHERE
            (p_search_query = '' OR l.entity_name ILIKE '%' || p_search_query || '%')
            AND (p_action_filter IS NULL OR l.action = p_action_filter)
            AND (p_entity_filter IS NULL OR l.entity_type = p_entity_filter)
            AND (p_start_date IS NULL OR l.created_at >= (p_start_date || 'T00:00:00Z')::timestamptz)
            AND (p_end_date IS NULL OR l.created_at <= (p_end_date || 'T23:59:59Z')::timestamptz)
    )
    SELECT
        fl.id,
        fl.action,
        fl.entity_type,
        fl.entity_id,
        fl.entity_name,
        fl.old_values,
        fl.new_values,
        fl.modified_by,
        fl.created_at,
        (SELECT COUNT(*)::BIGINT FROM filtered_logs) AS total_count
    FROM filtered_logs fl
    ORDER BY fl.created_at DESC
    LIMIT COALESCE(p_limit, 50)
    OFFSET v_offset;
END;
$$;

-- ⚠️ REVOKE FROM PUBLIC (pas seulement anon) — cf. note ci-dessus.
REVOKE EXECUTE ON FUNCTION get_paginated_catalog_logs_for_admin(
    INT, INT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION get_paginated_catalog_logs_for_admin(
    INT, INT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM anon;

GRANT EXECUTE ON FUNCTION get_paginated_catalog_logs_for_admin(
    INT, INT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;

-- Retirer l'accès direct à la table pour anon (laissé par 20260109000506).
-- Note : l'INSERT par les triggers d'audit passe par le rôle de la fonction
-- de log (SECURITY DEFINER), pas par anon → ce revoke ne casse pas l'audit.
REVOKE SELECT, INSERT ON TABLE public.global_catalog_audit_log FROM anon;

-- =====================================================
-- 4. get_bar_products — retrait de la branche JWT impersonation
-- =====================================================
-- Identique à 20251219000000, on retire seulement
-- « auth.jwt()->'user_metadata'->>'impersonation' = 'true' OR » du guard.
-- Le check membre du bar reste, suffisant pour tout usage légitime.

DROP FUNCTION IF EXISTS get_bar_products(UUID, UUID, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION get_bar_products(
    p_bar_id UUID,
    p_impersonating_user_id UUID DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    bar_id UUID,
    global_product_id UUID,
    local_name TEXT,
    local_image TEXT,
    local_category_id UUID,
    price NUMERIC,
    stock INTEGER,
    alert_threshold INTEGER,
    is_custom_product BOOLEAN,
    is_active BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    volume TEXT,
    display_name TEXT,
    global_product_name TEXT,
    category_name TEXT
) AS $$
BEGIN
  -- 🛡️ Accès réservé aux membres actifs du bar (branche impersonation retirée).
  IF EXISTS (
        SELECT 1 FROM bar_members bm_check
        WHERE bm_check.user_id = auth.uid()
          AND bm_check.bar_id = p_bar_id
          AND bm_check.is_active = true
     ) THEN

    RETURN QUERY
    SELECT
      bp.id,
      bp.bar_id,
      bp.global_product_id,
      bp.local_name,
      bp.local_image,
      bp.local_category_id,
      bp.price,
      bp.stock,
      bp.alert_threshold,
      bp.is_custom_product,
      bp.is_active,
      bp.created_at,
      bp.updated_at,
      bp.volume,
      bp.display_name,
      gp.name,
      bc.name
    FROM bar_products bp
    LEFT JOIN global_products gp ON bp.global_product_id = gp.id
    LEFT JOIN bar_categories bc ON bp.local_category_id = bc.id
    WHERE bp.bar_id = p_bar_id
    AND bp.is_active = true
    ORDER BY bp.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
  ELSE
    RAISE EXCEPTION 'Unauthorized';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_bar_products(UUID, UUID, INTEGER, INTEGER) TO authenticated;

COMMENT ON FUNCTION get_bar_products(UUID, UUID, INTEGER, INTEGER) IS
'Get paginated bar products with category info. Accès réservé aux membres actifs du bar (branche impersonation retirée 2026-06-23).';

-- =====================================================
-- 5. get_bar_members — retrait de la branche JWT impersonation
-- =====================================================
-- Identique à 20251231, on retire seulement la branche impersonation du guard.
-- Le check « membre OU owner » reste. Le SET LOCAL row_security = off est
-- conservé (volontaire : lire users malgré la RLS).

DROP FUNCTION IF EXISTS get_bar_members(UUID, UUID);

CREATE OR REPLACE FUNCTION get_bar_members(p_bar_id UUID, p_impersonating_user_id UUID DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  bar_id UUID,
  user_id UUID,
  role TEXT,
  is_active BOOLEAN,
  assigned_by UUID,
  assigned_at TIMESTAMPTZ,
  user_name TEXT,
  user_email TEXT,
  user_phone TEXT,
  username TEXT,
  created_at TIMESTAMPTZ,
  member_is_active BOOLEAN,
  first_login BOOLEAN,
  last_login_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ
) AS $$
BEGIN
  -- 🛡️ Accès réservé au membre du bar OU au propriétaire (branche impersonation retirée).
  IF (EXISTS (SELECT 1 FROM bar_members bm_check WHERE bm_check.user_id = auth.uid() AND bm_check.bar_id = p_bar_id) OR
      EXISTS (SELECT 1 FROM bars b_check WHERE b_check.id = p_bar_id AND b_check.owner_id = auth.uid())) THEN

    -- Disable RLS for this function execution
    SET LOCAL row_security = off;

    RETURN QUERY
    WITH all_members AS (
      -- 1. Regular members (active and inactive)
      SELECT
        bm.id,
        bm.bar_id,
        bm.user_id,
        bm.role,
        bm.is_active,
        bm.assigned_by,
        bm.assigned_at,
        u.name AS user_name,
        u.email AS user_email,
        u.phone AS user_phone,
        u.username,
        u.created_at,
        bm.is_active AS member_is_active,
        u.first_login,
        u.last_login_at,
        bm.assigned_at AS joined_at
      FROM bar_members bm
      LEFT JOIN users u ON bm.user_id = u.id
      WHERE bm.bar_id = p_bar_id

      UNION

      -- 2. Owner as 'promoteur' (if not already in bar_members)
      SELECT
        b.id AS id, -- Use bar ID as placeholder for membership ID
        b.id AS bar_id,
        b.owner_id AS user_id,
        'promoteur'::TEXT AS role,
        TRUE AS is_active,
        NULL::UUID AS assigned_by,
        b.created_at AS assigned_at,
        u.name AS user_name,
        u.email AS user_email,
        u.phone AS user_phone,
        u.username,
        u.created_at,
        TRUE AS member_is_active,
        u.first_login,
        u.last_login_at,
        b.created_at AS joined_at
      FROM bars b
      JOIN users u ON b.owner_id = u.id
      WHERE b.id = p_bar_id
      AND NOT EXISTS (SELECT 1 FROM bar_members bm WHERE bm.bar_id = p_bar_id AND bm.user_id = b.owner_id)
    )
    SELECT * FROM all_members
    ORDER BY user_name ASC NULLS LAST;
  ELSE
    RAISE EXCEPTION 'Unauthorized: User is not a member or owner of this bar';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_bar_members(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION get_bar_members(UUID, UUID) IS
'Get all bar members (including inactive) and the owner. Bypasses RLS on users table. Accès membre/owner (branche impersonation retirée 2026-06-23).';

COMMIT;
