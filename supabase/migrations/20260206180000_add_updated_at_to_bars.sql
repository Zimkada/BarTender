-- =====================================================
-- Migration: Ajouter updated_at à la table bars pour Optimistic Locking
-- Date: 2026-02-06
-- Objectif: Permettre la détection de conflits lors de la synchro offline (Sprint 2)
-- =====================================================

-- 1. Ajouter la colonne si elle n'existe pas
ALTER TABLE public.bars ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Créer ou remplacer la fonction de trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 3. Attacher le trigger à la table bars
DROP TRIGGER IF EXISTS set_bars_updated_at ON public.bars;
CREATE TRIGGER set_bars_updated_at
    BEFORE UPDATE ON public.bars
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Optionnel: Ajouter l'index pour les perfs si besoin de fetch par date
CREATE INDEX IF NOT EXISTS idx_bars_updated_at ON public.bars (updated_at);
