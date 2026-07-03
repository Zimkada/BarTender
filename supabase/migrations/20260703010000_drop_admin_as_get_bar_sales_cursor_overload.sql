-- =====================================================
-- MIGRATION: Purger la surcharge admin_as_get_bar_sales_cursor
-- Date: 2026-07-03
-- Suite de: 20260703000000_drop_reject_sale_overload.sql
--
-- Cette fonction avait été volontairement exclue de la migration précédente
-- car le fix documenté (MIGRATION_LOG.md:2139, "Changed parameters from
-- TIMESTAMPTZ -> DATE, matches business_date column type") concernait
-- explicitement sa jumelle get_bar_sales_cursor, pas celle-ci — le choix
-- DATE ici restait une inférence par analogie, pas une preuve directe.
--
-- CERTIFICATION DIRECTE COMPLÉMENTAIRE (2026-07-03) :
--   - pg_depend scopé sur admin_as_get_bar_sales_cursor (oids 115352 et
--     115376) : AUCUNE dépendance (résultat vide sur les deux oids).
--   - pg_stat_user_functions : calls=null sur les deux (tracking désactivé
--     globalement côté Supabase, cohérent avec le reste de l'audit — pas un
--     signal spécifique à cette fonction).
--   - pg_policies : aucune policy RLS ne référence cette fonction dans son
--     USING/WITH CHECK.
--   - grep repo complet (src/, supabase/functions/) : zéro appelant TS,
--     zéro appel depuis les 3 edge functions déployées
--     (admin-update-password, create-bar-member, send-refresh-alerts —
--     aucune n'appelle de RPC de type admin_as_*).
--
-- Niveau de preuve désormais identique aux 5 fonctions traitées dans la
-- migration précédente. Garder la variante DATE (cohérence avec
-- business_date, colonne DATE, même raisonnement que get_bar_sales_cursor).
-- =====================================================

DROP FUNCTION IF EXISTS public.admin_as_get_bar_sales_cursor(p_acting_as_user_id uuid, p_bar_id uuid, p_limit integer, p_cursor_date timestamp with time zone, p_cursor_id uuid);

-- Recharger le cache de schéma PostgREST
NOTIFY pgrst, 'reload schema';
