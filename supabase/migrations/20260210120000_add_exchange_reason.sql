-- =====================================================
-- Migration: Ajout du motif "exchange" aux retours
-- Date: 2026-02-10
-- Objectif: Autoriser le motif "exchange" pour Magic Swap
-- =====================================================

-- Supprimer l'ancienne contrainte
ALTER TABLE public.returns DROP CONSTRAINT IF EXISTS returns_reason_check;

-- Recréer la contrainte avec "exchange" inclus
ALTER TABLE public.returns ADD CONSTRAINT returns_reason_check 
  CHECK (reason IN ('defective', 'wrong_item', 'customer_change', 'expired', 'other', 'exchange'));

-- Commentaire pour traçabilité
COMMENT ON CONSTRAINT returns_reason_check ON public.returns IS 
  'Motifs de retour autorisés, incluant "exchange" pour Magic Swap';
