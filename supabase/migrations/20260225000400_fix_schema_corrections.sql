-- Migration: Corriger les incohérences de schéma détectées en revue
-- Description:
--   1. Renommer contribution_date → date dans capital_contributions
--   2. Rendre created_by nullable dans capital_contributions et initial_balances
-- Author: Zimkada
-- Date: 2026-02-25

-- ─────────────────────────────────────────────────────────────
-- Fix 1 : Renommer contribution_date → date (capital_contributions)
-- Conditionnel : ne fait rien si la colonne s'appelle déjà "date"
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'capital_contributions'
      AND column_name  = 'contribution_date'
  ) THEN
    ALTER TABLE capital_contributions RENAME COLUMN contribution_date TO date;

    -- Recréer l'index sur le nouveau nom
    DROP INDEX IF EXISTS idx_capital_contributions_date;
    CREATE INDEX idx_capital_contributions_date ON capital_contributions(date);

    -- Recréer la contrainte UNIQUE sur le nouveau nom
    ALTER TABLE capital_contributions
      DROP CONSTRAINT IF EXISTS capital_contributions_bar_id_contribution_date_source_key;
    ALTER TABLE capital_contributions
      ADD CONSTRAINT capital_contributions_bar_id_date_source_key
      UNIQUE (bar_id, date, source);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- Fix 2 : Rendre created_by nullable dans capital_contributions
-- Supprime la contrainte NOT NULL qui contredit ON DELETE SET NULL
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'capital_contributions'
      AND column_name  = 'created_by'
      AND is_nullable  = 'NO'
  ) THEN
    ALTER TABLE capital_contributions ALTER COLUMN created_by DROP NOT NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- Fix 3 : Rendre created_by nullable dans initial_balances
-- Même problème : NOT NULL + ON DELETE SET NULL = contradiction
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'initial_balances'
      AND column_name  = 'created_by'
      AND is_nullable  = 'NO'
  ) THEN
    ALTER TABLE initial_balances ALTER COLUMN created_by DROP NOT NULL;
  END IF;
END $$;
