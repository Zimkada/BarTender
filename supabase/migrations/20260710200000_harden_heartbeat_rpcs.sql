-- MIGRATION: Durcir les RPC heartbeat (guard membre + fermeture accès anon)
-- DATE: 2026-07-10
-- AUTHOR: BarTender

-- PROBLEM: Audit de certification du branchement client du heartbeat
--   (10/07/2026). Les RPC log_heartbeat et get_bar_health_status (créés le
--   07/02/2026, migrations 20260207120000/20260207120100) n'ont AUCUN GRANT
--   explicite. Or pg_default_acl est vide en prod (constat vague 4a,
--   20260703020000) : une fonction sans ACL hérite d'EXECUTE pour PUBLIC —
--   donc pour anon. Surface :
--   * log_heartbeat : SECURITY DEFINER SANS guard interne (aucun auth.uid()).
--     La RLS de bar_device_status est bypassée. Un appelant anon peut upserter
--     des heartbeats pour n'importe quel bar_id, et créer des lignes illimitées
--     en variant p_device_id (pollution du monitoring "Santé des Bars" +
--     gonflement de table). Même classe d'incident que cancel_sale/pay_ticket
--     en vague 4a.
--   * get_bar_health_status : possède DÉJÀ un guard super_admin inline (un
--     appel anon échoue : auth.uid() NULL → EXCEPTION). On rétablit seulement
--     l'hygiène de grants, pas de changement de corps.

-- IMPACT: Aucun utilisateur final. Le seul appelant légitime de log_heartbeat
--   est le hook useHeartbeat (RootLayout), toujours authentifié et membre du
--   bar — le guard ajouté est transparent pour lui.

-- SOLUTION:
--   1. log_heartbeat : ajout d'un guard membre inline répliquant la policy
--      INSERT de bar_device_status (EXISTS bar_members actif sur p_bar_id,
--      exception service_role) + SET search_path (pattern vague 4d).
--      Signature INCHANGÉE (pas de surcharge, pas de casse côté TS).
--   2. REVOKE ALL FROM PUBLIC/anon + GRANT authenticated, service_role sur
--      les deux fonctions. CREATE OR REPLACE perd les grants → toujours
--      re-poser REVOKE/GRANT après (leçon vagues 1-4).

-- BREAKING_CHANGE: NO
-- RLS_CHANGES: none (le guard inline réplique la policy INSERT existante)
-- IDEMPOTENT: OUI — CREATE OR REPLACE + REVOKE/GRANT réexécutables.

-- =====================================================
-- PRÉ-VOL (à exécuter avant, informatif — voir notes de session)
-- =====================================================
-- SELECT proname, proacl, pg_get_function_identity_arguments(p.oid) AS args
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND proname IN ('log_heartbeat', 'get_bar_health_status');
-- -- Attendu : proacl NULL (= EXECUTE hérité par PUBLIC) sur les deux,
-- -- signatures : log_heartbeat(p_bar_id uuid, p_device_id text,
-- --   p_app_version text, p_unsynced_count integer, p_battery_level integer)
-- --   / get_bar_health_status()

BEGIN;

-- =====================================================
-- 1. log_heartbeat — ajout du guard membre (réplique la policy INSERT de
--    bar_device_status). Corps identique à 20260207120000 sinon.
-- =====================================================
CREATE OR REPLACE FUNCTION public.log_heartbeat(
    p_bar_id UUID,
    p_device_id TEXT,
    p_app_version TEXT,
    p_unsynced_count INTEGER,
    p_battery_level INTEGER DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
    -- 🛡️ Guard membre (vague 4 pattern) : SECURITY DEFINER bypasse la RLS de
    -- bar_device_status, on réplique donc sa policy INSERT ici. Sans ce guard,
    -- l'ACL par défaut (EXECUTE PUBLIC) permettait à anon d'upserter des
    -- heartbeats arbitraires.
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
        ip_address = EXCLUDED.ip_address,
        user_agent = EXCLUDED.user_agent;
END;
$$;

-- =====================================================
-- 2. Hygiène de grants — CREATE OR REPLACE perd les ACL, on les repose,
--    et on ferme l'héritage PUBLIC sur les deux fonctions.
-- =====================================================
REVOKE ALL ON FUNCTION public.log_heartbeat(UUID, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_heartbeat(UUID, TEXT, TEXT, INTEGER, INTEGER) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_bar_health_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_bar_health_status() TO authenticated, service_role;

COMMIT;

-- =====================================================
-- POST-VOL (à exécuter après, informatif — voir notes de session)
-- =====================================================
-- SELECT has_function_privilege('anon', 'public.log_heartbeat(uuid,text,text,integer,integer)', 'EXECUTE') AS anon_heartbeat;
-- -- Attendu : false
--
-- SELECT has_function_privilege('authenticated', 'public.log_heartbeat(uuid,text,text,integer,integer)', 'EXECUTE') AS auth_heartbeat;
-- -- Attendu : true
--
-- SELECT has_function_privilege('anon', 'public.get_bar_health_status()', 'EXECUTE') AS anon_health;
-- -- Attendu : false
--
-- SELECT has_function_privilege('authenticated', 'public.get_bar_health_status()', 'EXECUTE') AS auth_health;
-- -- Attendu : true
--
-- Smoke-test final via UI (auth.uid() = NULL dans le SQL Editor) :
-- 1. App bar user : ouvrir l'app connecté sur un bar → aucune erreur console
--    [useHeartbeat] ; vérifier : SELECT * FROM bar_device_status; (1 ligne)
-- 2. Dashboard : /admin/security → "Santé des Bars" en super_admin → le bar
--    apparaît "En ligne".

-- ROLLBACK (si besoin) :
-- Recréer la version 20260207120000 de log_heartbeat (sans guard) puis
-- re-poser les grants d'origine (aucun = héritage PUBLIC).
