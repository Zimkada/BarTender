-- Migration: Corriger les erreurs du Security Advisor Supabase
-- Description:
--   1. Appliquer security_invoker=true sur les 5 vues analytiques
--      (migration 20260107_convert_views_to_security_invoker.sql jamais appliquée en base)
--   2. Supprimer table backup obsolète bar_products_backup_20260109 (83 lignes sans RLS)
--   3. Activer RLS sur training_versions (3 lignes metadata non sensibles)
-- Author: Zimkada
-- Date: 2026-02-25

-- ─────────────────────────────────────────────────────────────
-- Fix 1 : security_invoker sur les vues analytiques
-- Évite que les vues s'exécutent avec les droits du créateur (postgres)
-- Les filtres WHERE auth.uid() restent actifs et protègent les données
-- ─────────────────────────────────────────────────────────────
ALTER VIEW public.daily_sales_summary     SET (security_invoker = true);
ALTER VIEW public.expenses_summary        SET (security_invoker = true);
ALTER VIEW public.bar_stats_multi_period  SET (security_invoker = true);
ALTER VIEW public.top_products_by_period  SET (security_invoker = true);
ALTER VIEW public.salaries_summary        SET (security_invoker = true);

-- ─────────────────────────────────────────────────────────────
-- Fix 2 : Supprimer table backup obsolète (créée 2026-01-09)
-- 83 produits exposés sans RLS à tous les utilisateurs authentifiés
-- Table temporaire de backup - plus nécessaire
-- ─────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.bar_products_backup_20260109;

-- ─────────────────────────────────────────────────────────────
-- Fix 3 : RLS sur training_versions
-- Table non sensible (3 lignes de metadata de formation)
-- Lecture autorisée pour tous les authentifiés (comportement inchangé)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.training_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lecture publique pour utilisateurs authentifiés"
  ON public.training_versions
  FOR SELECT
  USING (auth.role() = 'authenticated');
