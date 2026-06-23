-- =====================================================
-- SÉCURITÉ — Vague 2 : guards sur les RPC admin de lecture plateforme
-- =====================================================
-- Date : 2026-06-23
-- Suite de la Vague 1 (20260623190359). Même principe : owner = postgres →
--   SECURITY DEFINER bypasse la RLS, donc « let RLS handle it » est faux.
--
-- Leçon de la Vague 1 : EXECUTE est accordé à PUBLIC par défaut → anon en hérite.
--   Toujours REVOKE FROM PUBLIC (pas seulement anon) puis re-GRANT authenticated.
--
-- Portée Vague 2 :
--   1. get_paginated_bars      (guard is_super_admin + REVOKE PUBLIC)
--   2. get_unique_bars         (guard + REVOKE PUBLIC)
--   3. get_dashboard_stats     (guard + REVOKE PUBLIC)
--   4. DROP get_user_bars(uuid)        — code mort (ancien flux impersonation)
--   5. DROP get_user_bars(uuid, uuid)  — code mort (remplacé par get_my_bars(),
--                                        BarsService.getUserBars sans appelant)
--
-- Vérifié : get_paginated_bars/unique_bars/dashboard_stats ne sont appelées que
--   par admin.service.ts (super_admin). get_user_bars n'a aucun appelant actif
--   (l'app utilise get_my_bars()). get_all_bar_members est DÉJÀ gardée (20260227)
--   → non incluse. Les variantes get_user_bars() et get_my_bars() (auth.uid())
--   sont sûres et conservées.
-- =====================================================

BEGIN;

-- =====================================================
-- 1. get_paginated_bars — guard super_admin
-- =====================================================
CREATE OR REPLACE FUNCTION get_paginated_bars(
    p_page INT,
    p_limit INT,
    p_search_query TEXT DEFAULT '',
    p_status_filter TEXT DEFAULT 'all',
    p_sort_by TEXT DEFAULT 'name',
    p_sort_order TEXT DEFAULT 'asc'
)
RETURNS TABLE (bars JSON, total_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- 🛡️ Réservé au super_admin : lecture de tous les bars de la plateforme.
    IF NOT is_super_admin() THEN
        RAISE EXCEPTION 'Access denied: super_admin required' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    WITH filtered_bars AS (
        SELECT
            b.id, b.name, b.address, b.phone, b.owner_id,
            b.created_at, b.is_active, b.closing_hour, b.settings
        FROM bars b
        WHERE
            (p_search_query = '' OR b.name ILIKE '%' || p_search_query || '%' OR b.address ILIKE '%' || p_search_query || '%') AND
            (p_status_filter = 'all' OR (p_status_filter = 'active' AND b.is_active = true) OR (p_status_filter = 'suspended' AND b.is_active = false))
    )
    SELECT
        (SELECT json_agg(json_build_object(
            'id', paginated.id,
            'name', paginated.name,
            'address', paginated.address,
            'phone', paginated.phone,
            'owner_id', paginated.owner_id,
            'created_at', paginated.created_at,
            'is_active', paginated.is_active,
            'closing_hour', paginated.closing_hour,
            'settings', paginated.settings
        )) FROM (
            SELECT *
            FROM filtered_bars
            ORDER BY
                CASE WHEN p_sort_by = 'name' AND p_sort_order = 'asc' THEN name END ASC,
                CASE WHEN p_sort_by = 'name' AND p_sort_order = 'desc' THEN name END DESC,
                CASE WHEN p_sort_by = 'created_at' AND p_sort_order = 'asc' THEN created_at END ASC,
                CASE WHEN p_sort_by = 'created_at' AND p_sort_order = 'desc' THEN created_at END DESC
            LIMIT p_limit
            OFFSET (p_page - 1) * p_limit
        ) paginated) AS bars,
        (SELECT COUNT(*) FROM filtered_bars) AS total_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_paginated_bars(INT, INT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_paginated_bars(INT, INT, TEXT, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION get_paginated_bars(INT, INT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- =====================================================
-- 2. get_unique_bars — guard super_admin
-- =====================================================
-- Recréée en plpgsql pour pouvoir porter le guard (l'originale était LANGUAGE sql).
DROP FUNCTION IF EXISTS get_unique_bars();

CREATE FUNCTION get_unique_bars()
RETURNS TABLE (id UUID, name TEXT, is_active BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- 🛡️ Réservé au super_admin : liste de tous les bars (filtre admin).
    IF NOT is_super_admin() THEN
        RAISE EXCEPTION 'Access denied: super_admin required' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT b.id, b.name, b.is_active
    FROM bars b
    ORDER BY b.name;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_unique_bars() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_unique_bars() FROM anon;
GRANT EXECUTE ON FUNCTION get_unique_bars() TO authenticated;

-- =====================================================
-- 3. get_dashboard_stats — guard super_admin
-- =====================================================
-- Recréée à l'identique (20260112000004) + guard en tête.
DROP FUNCTION IF EXISTS get_dashboard_stats(TEXT, UUID);

CREATE OR REPLACE FUNCTION get_dashboard_stats(p_period TEXT DEFAULT '1 day', p_cache_buster UUID DEFAULT gen_random_uuid())
RETURNS TABLE (
  total_revenue NUMERIC,
  sales_count BIGINT,
  active_users_count BIGINT,
  new_users_count BIGINT,
  bars_count BIGINT,
  active_bars_count BIGINT
) AS $$
DECLARE
  v_closing_hour INT := 6;
  v_period_days INT;
  v_start_ts TIMESTAMPTZ;
  v_end_ts TIMESTAMPTZ;
  v_today_business_start_ts TIMESTAMPTZ;
BEGIN
  -- 🛡️ Réservé au super_admin : statistiques globales de la plateforme.
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: super_admin required' USING ERRCODE = '42501';
  END IF;

  v_period_days := CAST(regexp_replace(p_period, '\D', '', 'g') AS INT);

  v_today_business_start_ts := date_trunc('day', NOW() AT TIME ZONE 'UTC') + (v_closing_hour || ' hours')::interval;
  IF (NOW() AT TIME ZONE 'UTC' < v_today_business_start_ts) THEN
    v_today_business_start_ts := v_today_business_start_ts - '1 day'::interval;
  END IF;

  IF p_period = '0 days' THEN
    v_start_ts := v_today_business_start_ts;
    v_end_ts := NOW() AT TIME ZONE 'UTC';
  ELSE
    v_end_ts := v_today_business_start_ts;
    v_start_ts := v_end_ts - (v_period_days || ' days')::interval;
  END IF;

  RETURN QUERY
  SELECT
    (SELECT COALESCE(SUM(s.total), 0) FROM sales s
      WHERE s.status = 'validated'
      AND s.created_at >= v_start_ts AND s.created_at < v_end_ts)::NUMERIC,

    (SELECT COUNT(*) FROM sales s
      WHERE s.status = 'validated'
      AND s.created_at >= v_start_ts AND s.created_at < v_end_ts)::BIGINT,

    (SELECT COUNT(DISTINCT u.id) FROM public.users u JOIN auth.users auth_u ON u.id = auth_u.id
      WHERE u.is_active = true
      AND auth_u.last_sign_in_at IS NOT NULL
      AND auth_u.last_sign_in_at >= v_start_ts AND auth_u.last_sign_in_at < v_end_ts)::BIGINT,

    (SELECT COUNT(*) FROM users u
      WHERE u.is_active = true
      AND u.created_at >= v_start_ts AND u.created_at < v_end_ts)::BIGINT,

    (SELECT COUNT(*) FROM bars)::BIGINT,

    (SELECT COUNT(*) FROM bars b WHERE b.is_active = true)::BIGINT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION get_dashboard_stats(TEXT, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_dashboard_stats(TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION get_dashboard_stats(TEXT, UUID) TO authenticated;

COMMENT ON FUNCTION get_dashboard_stats(TEXT, UUID) IS
'Global dashboard statistics. Guard super_admin ajouté 2026-06-23 (Vague 2).';

-- =====================================================
-- 4 & 5. DROP get_user_bars (code mort — fuite cross-tenant)
-- =====================================================
-- Aucune des deux signatures n'est appelée par l'app : BarsService.getUserBars
-- est orphelin (l'app utilise get_my_bars() via BarsService.getMyBars()).
-- La variante (uuid, uuid) acceptait un p_user_id arbitraire sans guard →
-- énumération des bars d'autrui. On supprime les deux.
DROP FUNCTION IF EXISTS get_user_bars(UUID);
DROP FUNCTION IF EXISTS get_user_bars(UUID, UUID);

COMMIT;
