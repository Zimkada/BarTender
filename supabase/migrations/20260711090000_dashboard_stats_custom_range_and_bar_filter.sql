-- MIGRATION: get_dashboard_stats — dates explicites + filtre par bar + business_date
-- DATE: 2026-07-11
-- AUTHOR: BarTender

-- PROBLEM: Trois défauts constatés sur le Dashboard Super Admin
--   (SuperAdminPage.tsx) :
--   1. Le bouton "Personnalisée" (SALES_HISTORY_FILTERS inclut 'custom') est
--      rendu par la page mais aucun sélecteur de dates n'existe côté UI, et
--      getPeriodForSQL() n'a pas de mapping pour 'custom' → retombe
--      SILENCIEUSEMENT sur '1 day' (Hier). L'utilisateur clique "Personnalisée",
--      le bouton s'active, mais les chiffres affichés restent ceux d'hier.
--      Cause racine : la RPC accepte un TEXTE de durée relative ('7 days'),
--      incompatible avec une plage de dates arbitraire.
--   2. Aucun filtre par bar — impossible d'isoler les stats d'un
--      établissement précis (demande terrain).
--   3. Le filtre temporel porte sur sales.created_at avec une heure de
--      fermeture FIXE à 6h UTC pour TOUS les bars, alors que business_date
--      (colonne déjà calculée par bar, cf. CLAUDE.md "journée comptable")
--      est la source de vérité correcte pour la journée commerciale.

-- IMPACT: Aucun utilisateur final. Observabilité admin (SuperAdmin) uniquement.
--   Changement de signature RPC : ancien appelant (AdminService.getDashboardStats,
--   seul appelant recensé) mis à jour dans le même lot.

-- SOLUTION: Nouvelle signature get_dashboard_stats(p_start_date DATE,
--   p_end_date DATE, p_bar_id UUID DEFAULT NULL). Le client (useDateRangeFilter)
--   calcule déjà startDate/endDate pour TOUTES les plages y compris 'custom' —
--   plus besoin de reparser une durée relative côté SQL, le bug "custom
--   retombe sur Hier" disparaît structurellement. Filtre sur business_date
--   (BETWEEN inclusif, cohérent avec le type DATE) au lieu de created_at.
--   p_bar_id NULL = toutes les stats plateforme (comportement actuel
--   inchangé) ; sinon restreint CA/ventes/utilisateurs à ce bar. Les 3 compteurs
--   de bars (total/actifs) restent volontairement globaux, non filtrés par
--   p_bar_id — un "bars_count" sur un seul bar n'aurait pas de sens.

-- BREAKING_CHANGE: OUI côté RPC (signature TEXT→DATE,DATE,UUID) — ancienne
--   fonction DROP explicitement. AdminService.getDashboardStats mis à jour
--   dans le même commit (aucun autre appelant recensé, cf. grep effectué).
-- RLS_CHANGES: none (guard is_super_admin() conservé à l'identique)
-- IDEMPOTENT: OUI — DROP FUNCTION IF EXISTS + CREATE OR REPLACE réexécutables.

-- =====================================================
-- PRÉ-VOL (à exécuter avant, informatif — voir notes de session)
-- =====================================================
-- SELECT proname, pg_get_function_identity_arguments(oid) AS args
-- FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'get_dashboard_stats';
-- -- Attendu : 1 ligne, "p_period text, p_cache_buster uuid"
--
-- SELECT has_function_privilege('authenticated', 'public.get_dashboard_stats(text,uuid)', 'EXECUTE') AS auth_old;
-- -- Attendu : true (état avant migration)

BEGIN;

-- 🛡️ DROP explicite obligatoire : signature TEXT,UUID → DATE,DATE,UUID n'est
-- pas un simple ajout de paramètre DEFAULT, c'est un changement de TYPES —
-- CREATE OR REPLACE créerait une surcharge ambiguë au lieu de remplacer.
-- Précédent exact dans ce projet : 20251215_fix_dashboard_stats_date_logic.sql.
DROP FUNCTION IF EXISTS public.get_dashboard_stats(TEXT, UUID);

CREATE OR REPLACE FUNCTION public.get_dashboard_stats(
    p_start_date DATE,
    p_end_date DATE,
    p_bar_id UUID DEFAULT NULL
)
RETURNS TABLE (
    total_revenue NUMERIC,
    sales_count BIGINT,
    active_users_count BIGINT,
    new_users_count BIGINT,
    bars_count BIGINT,
    active_bars_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
    -- 🛡️ Réservé au super_admin : statistiques globales de la plateforme (inchangé).
    IF NOT is_super_admin() THEN
        RAISE EXCEPTION 'Access denied: super_admin required' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
        -- Total Revenue — filtré sur business_date (journée commerciale par bar,
        -- pas created_at avec heure de fermeture fixe globale)
        (SELECT COALESCE(SUM(s.total), 0) FROM public.sales s
            WHERE s.status = 'validated'
              AND s.business_date BETWEEN p_start_date AND p_end_date
              AND (p_bar_id IS NULL OR s.bar_id = p_bar_id))::NUMERIC,

        -- Sales Count
        (SELECT COUNT(*) FROM public.sales s
            WHERE s.status = 'validated'
              AND s.business_date BETWEEN p_start_date AND p_end_date
              AND (p_bar_id IS NULL OR s.bar_id = p_bar_id))::BIGINT,

        -- Active Users : connectés dans la période, restreint aux membres du
        -- bar sélectionné si p_bar_id fourni
        (SELECT COUNT(DISTINCT u.id) FROM public.users u
            JOIN auth.users auth_u ON u.id = auth_u.id
            WHERE u.is_active = true
              AND auth_u.last_sign_in_at IS NOT NULL
              AND auth_u.last_sign_in_at::DATE BETWEEN p_start_date AND p_end_date
              AND (p_bar_id IS NULL OR EXISTS (
                  SELECT 1 FROM public.bar_members bm
                  WHERE bm.user_id = u.id AND bm.bar_id = p_bar_id AND bm.is_active = true
              )))::BIGINT,

        -- New Users : créés dans la période, restreint aux membres du bar
        -- sélectionné si p_bar_id fourni
        (SELECT COUNT(*) FROM public.users u
            WHERE u.is_active = true
              AND u.created_at::DATE BETWEEN p_start_date AND p_end_date
              AND (p_bar_id IS NULL OR EXISTS (
                  SELECT 1 FROM public.bar_members bm
                  WHERE bm.user_id = u.id AND bm.bar_id = p_bar_id AND bm.is_active = true
              )))::BIGINT,

        -- Total Bars — volontairement NON filtré par p_bar_id (pas de sens sur 1 bar)
        (SELECT COUNT(*) FROM public.bars)::BIGINT,

        -- Active Bars — idem, toujours global
        (SELECT COUNT(DISTINCT bm.bar_id) FROM public.bar_members bm WHERE bm.is_active = true)::BIGINT;
END;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_stats(DATE, DATE, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(DATE, DATE, UUID) TO authenticated;

COMMENT ON FUNCTION public.get_dashboard_stats(DATE, DATE, UUID) IS
'Statistiques globales du dashboard SuperAdmin. Dates explicites (remplace la durée relative TEXT — corrige le filtre "Personnalisée" cassé). Filtre optionnel par bar. business_date au lieu de created_at (journée commerciale par bar). Guard super_admin.';

COMMIT;

-- =====================================================
-- POST-VOL (à exécuter après, informatif — voir notes de session)
-- =====================================================
-- SELECT proname, pg_get_function_identity_arguments(oid) AS args
-- FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'get_dashboard_stats';
-- -- Attendu : 1 SEULE ligne (pas de surcharge résiduelle), "p_start_date date, p_end_date date, p_bar_id uuid"
--
-- SELECT has_function_privilege('anon', 'public.get_dashboard_stats(date,date,uuid)', 'EXECUTE') AS anon_blocked;
-- -- Attendu : false
--
-- SELECT has_function_privilege('authenticated', 'public.get_dashboard_stats(date,date,uuid)', 'EXECUTE') AS auth_ok;
-- -- Attendu : true
--
-- SELECT * FROM get_dashboard_stats(CURRENT_DATE - 7, CURRENT_DATE, NULL);
-- -- Attendu : 1 ligne, stats plateforme sur 7 jours (nécessite d'être exécuté en tant que super_admin réel — auth.uid() = NULL dans le SQL Editor fera échouer le guard, c'est attendu)
--
-- Smoke-test final via UI (le guard is_super_admin() bloque le SQL Editor) :
-- /admin (Dashboard) → filtre "Personnalisée" avec 2 dates → chiffres cohérents
-- avec la plage choisie (pas ceux d'"Hier") ; sélecteur de bar → chiffres
-- CA/ventes/utilisateurs changent, bars_count/active_bars_count inchangés.

-- ROLLBACK (si besoin) :
-- Recréer get_dashboard_stats(TEXT, UUID) avec le corps de
-- 20260623203318_secure_admin_rpcs_wave2.sql, et revenir à l'ancien appel
-- côté AdminService.getDashboardStats.
