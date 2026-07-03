-- =====================================================
-- MIGRATION: Vague 4d — Hardening search_path des RPC SECURITY DEFINER
-- Date: 2026-07-03
-- Suite de: 20260703040000_vague4c_cump_single_source_of_truth.sql
--
-- CONTEXTE (diagnostic H1 en prod, 2026-07-03) : 15 fonctions SECURITY
-- DEFINER n'ont PAS de search_path fixé (proconfig NULL). Une fonction
-- SECURITY DEFINER sans "SET search_path" hérite du search_path de l'APPELANT
-- → vecteur d'injection de schéma (lint Supabase function_search_path_mutable) :
-- un appelant malveillant peut placer un schéma prioritaire contenant une
-- fonction/table homonyme et détourner la résolution de noms à l'intérieur
-- de la fonction DEFINER (qui s'exécute avec les droits du owner postgres).
--
-- CORRECTIF : ALTER FUNCTION ... SET search_path = public, extensions.
-- C'est PUREMENT ADDITIF : ça ne change AUCUNE ligne de logique, seulement le
-- contexte de résolution des noms. Aucun risque de régression fonctionnelle
-- (les fonctions référencent déjà public.* implicitement).
--
-- HORS PÉRIMÈTRE (volontairement) :
--   - Résidus impersonation (p_impersonating_user_id sur get_bar_members,
--     get_bar_products, _get_target_user_id — diagnostic H2) : les retirer
--     CHANGE la signature de fonctions de lecture ACTIVES → risque de casser
--     l'appelant TS. À traiter séparément avec pré-vol signature + adaptation
--     du code TS. Ici on se contente de leur poser search_path (elles sont
--     dans la liste H1), sans toucher à leur signature.
--
-- PRÉ-VOL (déjà exécuté — diagnostic H1) : les 15 fonctions ci-dessous ont
--   proconfig NULL. Ce sont des ALTER idempotents (rejouables sans effet de
--   bord). Un ALTER sur une signature inexistante échoue → si l'une échoue,
--   c'est que la signature a divergé, à investiguer (mais H1 les a listées
--   telles quelles depuis pg_proc, donc elles matchent).
-- =====================================================

-- Gestion de membres
ALTER FUNCTION public.add_bar_member_existing(uuid, uuid, text, text)
    SET search_path = public, extensions;
ALTER FUNCTION public.add_bar_member_v2(uuid, uuid, text, uuid)
    SET search_path = public, extensions;
ALTER FUNCTION public.assign_bar_member(uuid, uuid, text, uuid)
    SET search_path = public, extensions;
ALTER FUNCTION public.remove_bar_member_v2(uuid, uuid, uuid)
    SET search_path = public, extensions;

-- Vérifications plan / features
ALTER FUNCTION public.check_bar_has_feature(uuid, text)
    SET search_path = public, extensions;
ALTER FUNCTION public.check_plan_member_limit(uuid, uuid)
    SET search_path = public, extensions;

-- Flux de vente / ticket critiques (⚠️ les plus importants : elles écrivent
-- des données financières et font SET LOCAL row_security = off)
ALTER FUNCTION public.create_sale_idempotent(uuid, jsonb, text, uuid, text, uuid, text, text, text, text, date, uuid, uuid)
    SET search_path = public, extensions;
ALTER FUNCTION public.create_ticket(uuid, uuid, text, uuid, integer, integer, text, text)
    SET search_path = public, extensions;

-- Lectures scopées (résidus impersonation : signature NON modifiée ici)
ALTER FUNCTION public.get_bar_members(uuid, uuid)
    SET search_path = public, extensions;
ALTER FUNCTION public.get_bar_products(uuid, uuid, integer, integer, boolean)
    SET search_path = public, extensions;
ALTER FUNCTION public.get_dashboard_stats(text, uuid)
    SET search_path = public, extensions;

-- Rafraîchissement de vues matérialisées (internes)
ALTER FUNCTION public.refresh_all_materialized_views(text)
    SET search_path = public, extensions;
ALTER FUNCTION public.refresh_expenses_summary()
    SET search_path = public, extensions;
ALTER FUNCTION public.refresh_materialized_view_with_logging(text, text)
    SET search_path = public, extensions;
ALTER FUNCTION public.refresh_salaries_summary()
    SET search_path = public, extensions;

-- =====================================================
-- Nettoyage complémentaire : anon ne doit pas lire les logs de refresh
-- (diagnostic E : anon a SELECT sur materialized_view_refresh_log — fuite
-- d'infos internes sans usage légitime)
-- =====================================================
REVOKE SELECT ON TABLE public.materialized_view_refresh_log FROM anon;

-- Recharger le cache de schéma PostgREST
NOTIFY pgrst, 'reload schema';

-- =====================================================
-- POST-VOL (à exécuter après — résultats à certifier) :
--   -- (a) Plus aucune de ces 15 fonctions n'a proconfig NULL :
--   SELECT p.proname, p.proconfig
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname='public' AND p.prosecdef = true
--     AND (p.proconfig IS NULL OR NOT EXISTS (
--         SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'))
--   ORDER BY p.proname;
--   -- Attendu : résultat VIDE (toutes ont désormais un search_path).
--
--   -- (b) anon n'a plus SELECT sur materialized_view_refresh_log :
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--   WHERE table_schema='public' AND table_name='materialized_view_refresh_log'
--     AND grantee='anon';
--   -- Attendu : résultat VIDE.
-- =====================================================
