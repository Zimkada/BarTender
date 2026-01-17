-- =====================================================
-- ⚠️ MIGRATION DÉSACTIVÉE - REMPLACÉE PAR 20260117000006
-- =====================================================
-- Cette migration était TROP BRUTALE:
-- Elle marquait TOUS les bars comme complétés, même les nouveaux
-- bars en cours de configuration.
--
-- Remplacée par: 20260117000006_auto_complete_existing_bars.sql
-- qui utilise validation métier intelligente (check_bar_setup_complete)
-- =====================================================

-- Migration: Mark legacy bars as setup complete
-- Purpose: Fix the indicator for old bars that were created before onboarding system
-- Date: 2026-01-13
-- Description: All bars that have been created before should be marked as setup_complete
-- to avoid showing the incomplete setup indicator for existing bars

-- DÉSACTIVÉ - Ne rien faire
-- Cette migration est maintenant un NO-OP
SELECT 1 WHERE false;
