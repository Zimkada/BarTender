-- MIGRATION: Signal de qualité de connexion dans le Heartbeat (pas juste présence)
-- DATE: 2026-07-10
-- AUTHOR: BarTender

-- PROBLEM: Le dashboard "Santé des Bars" (branché le 10/07/2026, migrations
--   20260207120000/100/200/20260710200000) ne mesure que la PRÉSENCE d'un
--   appareil (dernier heartbeat < 15 min = "En ligne"), pas la QUALITÉ de sa
--   connexion. Cas terrain récurrent : un gérant appelle "l'app ne marche
--   pas" alors que son appareil a bien émis un heartbeat récent — la
--   connexion coupe/rame par intermittence (< 15 min entre deux signaux),
--   invisible avec un statut binaire online/offline.

-- IMPACT: Aucun utilisateur final. Observabilité admin (SuperAdmin) uniquement.

-- SOLUTION: Deux nouveaux compteurs, remontés par le client (collectés en
--   mémoire par ConnectionQualityTracker, cf. src/services/
--   ConnectionQualityTracker.ts, reset uniquement après confirmation d'envoi) :
--   - recent_sale_timeouts : tentatives de vente ayant échoué pour cause
--     réseau (timeout/fetch) depuis le dernier heartbeat. Capté dans
--     SalesService.createSale, sur le chemin réel des ventes (contrairement à
--     useRobustOperation, quasi inutilisé dans la codebase).
--   - recent_network_drops : nombre de transitions NetworkManager vers
--     'unstable'/'offline' depuis le dernier heartbeat.
--   Ni l'un ni l'autre n'est un historique — la table reste un état courant
--   par (bar_id, device_id), cohérent avec le modèle existant (upsert).
--   Paramètres RPC avec DEFAULT 0 : la NOUVELLE signature (7 params) reste
--   appelable en passant seulement les 5 premiers — utile pour service_role
--   ou un futur appelant qui n'a pas ces métriques. Ceci ne couvre PAS un
--   ancien build client qui appellerait encore l'ancienne signature 5-arg :
--   celle-ci est explicitement DROP (cf. section 2) pour éviter une
--   ambiguïté de surcharge — un tel appel échouerait en "function not
--   found" jusqu'au déploiement du nouveau build. Acceptable : fenêtre
--   courte, dashboard admin non critique, cf. IMPACT ci-dessous.

-- BREAKING_CHANGE: NO (colonnes nullable + defaults, paramètres RPC avec DEFAULT)
-- RLS_CHANGES: none (RLS de bar_device_status déjà en place, cf. 20260207120000)
-- IDEMPOTENT: OUI — ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE réexécutables.

-- =====================================================
-- PRÉ-VOL (à exécuter avant, informatif — voir notes de session)
-- =====================================================
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'bar_device_status';
-- -- Attendu : pas encore de recent_sale_timeouts / recent_network_drops
--
-- SELECT has_function_privilege('authenticated', 'public.log_heartbeat(uuid,text,text,integer,integer)', 'EXECUTE') AS auth_heartbeat;
-- -- Attendu : true (posé par 20260710200000)

BEGIN;

-- =====================================================
-- 1. Colonnes — compteurs "depuis le dernier heartbeat", pas un historique
-- =====================================================
ALTER TABLE public.bar_device_status
    ADD COLUMN IF NOT EXISTS recent_sale_timeouts INTEGER NOT NULL DEFAULT 0
        CONSTRAINT recent_sale_timeouts_positive CHECK (recent_sale_timeouts >= 0),
    ADD COLUMN IF NOT EXISTS recent_network_drops INTEGER NOT NULL DEFAULT 0
        CONSTRAINT recent_network_drops_positive CHECK (recent_network_drops >= 0);

COMMENT ON COLUMN public.bar_device_status.recent_sale_timeouts IS
'Tentatives de vente échouées pour cause réseau (timeout/fetch) depuis le heartbeat précédent. Écrasé à chaque heartbeat (pas un cumul historique).';
COMMENT ON COLUMN public.bar_device_status.recent_network_drops IS
'Transitions NetworkManager vers unstable/offline depuis le heartbeat précédent. Écrasé à chaque heartbeat (pas un cumul historique).';

-- =====================================================
-- 2. log_heartbeat — deux nouveaux paramètres optionnels (DEFAULT 0)
-- =====================================================
-- 🛡️ DROP explicite obligatoire : CREATE OR REPLACE ne remplace une fonction
-- que si la liste de TYPES de paramètres est identique. Ici 5 → 7 paramètres :
-- sans ce DROP, PostgreSQL créerait une SURCHARGE (deuxième fonction
-- log_heartbeat en base) au lieu de remplacer l'ancienne — l'appel du client
-- deviendrait ambigu (PostgREST ne sait pas laquelle choisir → erreur).
-- Précédent exact dans ce projet : 20251215_fix_dashboard_stats_date_logic.sql
-- ("the new function might create a NEW overload instead of replacing the old one").
DROP FUNCTION IF EXISTS public.log_heartbeat(UUID, TEXT, TEXT, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION public.log_heartbeat(
    p_bar_id UUID,
    p_device_id TEXT,
    p_app_version TEXT,
    p_unsynced_count INTEGER,
    p_battery_level INTEGER DEFAULT NULL,
    p_recent_sale_timeouts INTEGER DEFAULT 0,
    p_recent_network_drops INTEGER DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
    -- Guard membre (identique à 20260710200000, inchangé)
    IF auth.role() != 'service_role' AND NOT EXISTS (
        SELECT 1 FROM public.bar_members
        WHERE bar_id = p_bar_id
          AND user_id = auth.uid()
          AND is_active = true
    ) THEN
        RAISE EXCEPTION 'Access denied: active bar membership required';
    END IF;

    INSERT INTO public.bar_device_status (
        bar_id,
        device_id,
        app_version,
        unsynced_count,
        battery_level,
        recent_sale_timeouts,
        recent_network_drops,
        last_heartbeat_at,
        ip_address,
        user_agent
    )
    VALUES (
        p_bar_id,
        p_device_id,
        p_app_version,
        p_unsynced_count,
        p_battery_level,
        GREATEST(p_recent_sale_timeouts, 0),
        GREATEST(p_recent_network_drops, 0),
        now(),
        COALESCE(inet_client_addr()::text, 'unknown'),
        COALESCE(
            (current_setting('request.headers', true)::json->>'user-agent'),
            'unknown'
        )
    )
    ON CONFLICT (bar_id, device_id)
    DO UPDATE SET
        last_heartbeat_at = now(),
        app_version = EXCLUDED.app_version,
        unsynced_count = EXCLUDED.unsynced_count,
        battery_level = EXCLUDED.battery_level,
        recent_sale_timeouts = EXCLUDED.recent_sale_timeouts,
        recent_network_drops = EXCLUDED.recent_network_drops,
        ip_address = EXCLUDED.ip_address,
        user_agent = EXCLUDED.user_agent;
END;
$$;

-- =====================================================
-- 3. get_bar_health_status — expose les 2 colonnes + un statut qualité dérivé
-- =====================================================
-- 🛡️ DROP explicite obligatoire : PostgreSQL interdit CREATE OR REPLACE dès
-- que la liste de colonnes RETURNS TABLE change (même par ajout en fin de
-- liste) → ERROR 42P13 "cannot change return type of existing function".
-- Précédents exacts dans ce projet : 20260227000000_fix_refresh_infrastructure.sql
-- (refresh_expenses_summary void→UUID) et 20251215_fix_dashboard_stats_date_logic.sql.
DROP FUNCTION IF EXISTS public.get_bar_health_status();

CREATE OR REPLACE FUNCTION public.get_bar_health_status()
RETURNS TABLE (
    bar_id UUID,
    bar_name TEXT,
    device_id TEXT,
    app_version TEXT,
    last_heartbeat_at TIMESTAMPTZ,
    unsynced_count INTEGER,
    battery_level INTEGER,
    status TEXT, -- 'online', 'warning', 'offline' (présence)
    minutes_since_heartbeat NUMERIC,
    recent_sale_timeouts INTEGER,
    recent_network_drops INTEGER,
    connection_quality TEXT -- 'good', 'degraded', 'unknown' (qualité, indépendante de la présence)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- SECURITY: Only super_admins can access this dashboard (inchangé)
    IF NOT EXISTS (
        SELECT 1 FROM public.bar_members
        WHERE user_id = auth.uid()
        AND role = 'super_admin'
        AND is_active = true
    ) AND auth.role() != 'service_role' THEN
        RAISE EXCEPTION 'Access denied: super_admin role required';
    END IF;

    RETURN QUERY
    WITH device_status AS (
        SELECT DISTINCT ON (bds.bar_id)
            bds.bar_id,
            bds.device_id,
            bds.app_version,
            bds.last_heartbeat_at,
            bds.unsynced_count,
            bds.battery_level,
            bds.recent_sale_timeouts,
            bds.recent_network_drops
        FROM public.bar_device_status bds
        WHERE bds.last_heartbeat_at IS NOT NULL
        ORDER BY bds.bar_id, bds.last_heartbeat_at DESC NULLS LAST
    )
    SELECT
        b.id AS bar_id,
        b.name AS bar_name,
        ds.device_id,
        ds.app_version,
        ds.last_heartbeat_at,
        COALESCE(ds.unsynced_count, 0) AS unsynced_count,
        ds.battery_level,
        CASE
            WHEN ds.last_heartbeat_at IS NULL THEN 'offline'
            WHEN ds.last_heartbeat_at > now() - interval '15 minutes' THEN 'online'
            WHEN ds.last_heartbeat_at > now() - interval '60 minutes' THEN 'warning'
            ELSE 'offline'
        END AS status,
        CASE
            WHEN ds.last_heartbeat_at IS NULL THEN NULL
            ELSE ROUND(EXTRACT(EPOCH FROM (now() - ds.last_heartbeat_at)) / 60, 2)
        END AS minutes_since_heartbeat,
        COALESCE(ds.recent_sale_timeouts, 0) AS recent_sale_timeouts,
        COALESCE(ds.recent_network_drops, 0) AS recent_network_drops,
        -- Qualité : seuils volontairement bas (2+ événements) — un seul
        -- timeout isolé arrive normalement en 2G/3G AOF, mais 2+ événements
        -- entre deux heartbeats (5 min) signalent une dégradation réelle.
        -- 'unknown' si le bar n'a jamais émis (pas de heartbeat_at).
        CASE
            WHEN ds.last_heartbeat_at IS NULL THEN 'unknown'
            WHEN COALESCE(ds.recent_sale_timeouts, 0) >= 2
                OR COALESCE(ds.recent_network_drops, 0) >= 2 THEN 'degraded'
            ELSE 'good'
        END AS connection_quality
    FROM public.bars b
    LEFT JOIN device_status ds ON b.id = ds.bar_id
    WHERE b.is_active = true
    ORDER BY
        CASE
            WHEN ds.last_heartbeat_at IS NULL THEN 3
            WHEN ds.last_heartbeat_at > now() - interval '15 minutes' THEN 1
            ELSE 2
        END,
        b.name;
END;
$$;

-- =====================================================
-- 4. Hygiène de grants — CREATE OR REPLACE perd les ACL (leçon vagues 1-4/4a),
--    on les repose avec les nouvelles signatures.
-- =====================================================
REVOKE ALL ON FUNCTION public.log_heartbeat(UUID, TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_heartbeat(UUID, TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_bar_health_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_bar_health_status() TO authenticated, service_role;

COMMIT;

-- =====================================================
-- POST-VOL (à exécuter après, informatif — voir notes de session)
-- =====================================================
-- SELECT column_name, data_type, column_default FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'bar_device_status'
--   AND column_name IN ('recent_sale_timeouts', 'recent_network_drops');
-- -- Attendu : 2 lignes, integer, default 0
--
-- SELECT has_function_privilege('anon', 'public.log_heartbeat(uuid,text,text,integer,integer,integer,integer)', 'EXECUTE') AS anon_heartbeat;
-- -- Attendu : false
--
-- SELECT has_function_privilege('authenticated', 'public.log_heartbeat(uuid,text,text,integer,integer,integer,integer)', 'EXECUTE') AS auth_heartbeat;
-- -- Attendu : true
--
-- SELECT * FROM get_bar_health_status();
-- -- Attendu : colonnes recent_sale_timeouts, recent_network_drops, connection_quality présentes
--
-- Smoke-test final via UI (auth.uid() = NULL dans le SQL Editor) :
-- app connectée sur un bar → aucune erreur console [useHeartbeat] ; puis
-- /admin/security → "Santé des Bars" → connection_quality visible par bar.

-- ROLLBACK (si besoin) :
-- Recréer log_heartbeat/get_bar_health_status avec les signatures de
-- 20260710200000 (5 params / colonnes sans qualité). Les colonnes ajoutées
-- peuvent rester (nullable-safe, DEFAULT 0) sans les DROP.
