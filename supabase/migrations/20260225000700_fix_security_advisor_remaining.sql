-- Migration: Corriger les warnings Security Advisor restants
-- Date: 2026-02-25
--
-- Fixes appliqués :
--   1. Materialized View in API → Révoquer l'accès direct aux 3 vues matérialisées
--      non utilisées directement en frontend
--
-- Warnings laissés intentionnellement :
--   - RLS Policy Always True sur les tables d'audit : les politiques SELECT
--     sont déjà correctes (is_super_admin()). Les politiques INSERT WITH CHECK (true)
--     sont intentionnelles — les triggers SECURITY DEFINER ont besoin d'écrire dedans.
--     Changer ces INSERT policies casserait les logs d'audit.
--   - Extension in Public (pg_trgm, pg_net) : impossible à corriger sans
--     supprimer/recréer les extensions (trop risqué).
--   - Leaked Password Protection : à activer dans le Dashboard Supabase
--     → Authentication → Providers → Email → "Leaked password protection"

-- ─────────────────────────────────────────────────────────────────────────────
-- Fix : Retirer l'accès API direct aux vues matérialisées non protégées
--
-- EXCLUES du REVOKE (utilisées directement en frontend) :
--   - bar_ancillary_stats_mat  (BarStatsModal.tsx:59)
--
-- Pour les 3 ci-dessous : l'accès aux données reste possible via les vues
-- normales sécurisées (expenses_summary, etc.) qui filtrent par auth.uid()
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE SELECT ON public.expenses_summary_mat    FROM anon, authenticated;
REVOKE SELECT ON public.bars_with_stats         FROM anon, authenticated;
REVOKE SELECT ON public.product_sales_stats_mat FROM anon, authenticated;

-- S'assurer que les vues normales au-dessus gardent bien leur accès
GRANT SELECT ON public.expenses_summary TO authenticated;
