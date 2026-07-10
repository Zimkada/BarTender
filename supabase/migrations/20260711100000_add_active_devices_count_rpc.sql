-- MIGRATION: RPC get_active_devices_count — appareils réellement actifs maintenant
-- DATE: 2026-07-11
-- AUTHOR: BarTender

-- PROBLEM: La carte "Utilisateurs connectés" du Dashboard Super Admin
--   (SuperAdminPage.tsx) affiche active_users_count, calculé par
--   get_dashboard_stats à partir de auth.users.last_sign_in_at dans la
--   période sélectionnée. Le libellé laisse croire à du temps réel ("qui
--   est connecté maintenant"), alors que la donnée réelle est "combien
--   d'utilisateurs se sont connectés au moins une fois durant la période" —
--   un utilisateur compte même si sa session a expiré depuis des jours.

-- IMPACT: Aucun utilisateur final. Observabilité admin (SuperAdmin) uniquement.

-- SOLUTION: Nouvelle RPC dédiée get_active_devices_count(p_bar_id UUID
--   DEFAULT NULL), indépendante de tout filtre de période — c'est un
--   INSTANTANÉ (comme l'onglet "Santé des Bars"), pas une métrique sur
--   plage de dates. Compte les appareils avec un heartbeat < 15 minutes
--   dans bar_device_status (même seuil que get_bar_health_status, cf.
--   20260710210000). Compte des APPAREILS (device_id), pas des
--   utilisateurs distincts : un gérant avec tablette + téléphone actifs
--   compte pour 2 — c'est la sémantique "combien d'écrans utilisent l'app
--   là maintenant", plus utile opérationnellement que le nombre de
--   personnes. Filtre optionnel p_bar_id, cohérent avec le sélecteur de
--   bar déjà présent sur SuperAdminPage (cf. 20260711090000).
--   Filtre additionnel bars.is_active = true : un appareil ne doit pas
--   compter comme "actif" si son bar a été suspendu entre-temps.

-- BREAKING_CHANGE: NO (nouvelle fonction, n'affecte aucun appelant existant)
-- RLS_CHANGES: none (nouvelle fonction, guard is_super_admin() comme les
--   autres RPC admin — cf. get_dashboard_stats, get_bar_health_status)
-- IDEMPOTENT: OUI — DROP FUNCTION IF EXISTS + CREATE OR REPLACE réexécutables.

-- =====================================================
-- PRÉ-VOL (à exécuter avant, informatif — voir notes de session)
-- =====================================================
-- SELECT proname FROM pg_proc
-- WHERE pronamespace = 'public'::regnamespace AND proname = 'get_active_devices_count';
-- -- Attendu : 0 ligne (fonction n'existe pas encore)

BEGIN;

DROP FUNCTION IF EXISTS public.get_active_devices_count(UUID);

CREATE OR REPLACE FUNCTION public.get_active_devices_count(
    p_bar_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    -- 🛡️ Réservé au super_admin : observabilité plateforme (même guard que
    -- get_dashboard_stats et get_bar_health_status).
    IF NOT is_super_admin() THEN
        RAISE EXCEPTION 'Access denied: super_admin required' USING ERRCODE = '42501';
    END IF;

    SELECT COUNT(*) INTO v_count
    FROM public.bar_device_status bds
    JOIN public.bars b ON b.id = bds.bar_id
    WHERE bds.last_heartbeat_at > now() - interval '15 minutes'
      AND b.is_active = true
      AND (p_bar_id IS NULL OR bds.bar_id = p_bar_id);

    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.get_active_devices_count(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_active_devices_count(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_active_devices_count(UUID) IS
'Nombre d''appareils avec heartbeat < 15 min (instantané, pas filtré par période). Remplace le libellé trompeur "Utilisateurs connectés" du Dashboard SuperAdmin, qui mesurait des connexions historiques, pas du temps réel. Compte des appareils (device_id), pas des utilisateurs distincts. Guard super_admin.';

COMMIT;

-- =====================================================
-- POST-VOL (à exécuter après, informatif — voir notes de session)
-- =====================================================
-- SELECT proname, pg_get_function_identity_arguments(oid) AS args
-- FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'get_active_devices_count';
-- -- Attendu : 1 SEULE ligne, "p_bar_id uuid"
--
-- SELECT has_function_privilege('anon', 'public.get_active_devices_count(uuid)', 'EXECUTE') AS anon_blocked;
-- -- Attendu : false
--
-- SELECT has_function_privilege('authenticated', 'public.get_active_devices_count(uuid)', 'EXECUTE') AS auth_ok;
-- -- Attendu : true
--
-- Smoke-test (le guard is_super_admin() bloque le SQL Editor, auth.uid() = NULL) :
-- via UI /admin (Dashboard) en super_admin → carte "Appareils actifs" affiche
-- un chiffre cohérent avec le nombre réel de tablettes/téléphones ouverts sur
-- l'app en ce moment (probablement 0 tant que le heartbeat n'est pas déployé
-- en prod, cf. notes de session — c'est le comportement correct, pas un bug).

-- ROLLBACK (si besoin) :
-- DROP FUNCTION IF EXISTS public.get_active_devices_count(UUID);
