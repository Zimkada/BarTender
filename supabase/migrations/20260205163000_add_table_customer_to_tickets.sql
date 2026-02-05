-- =====================================================
-- Migration: Ajouter colonnes table_number et customer_name à tickets
-- Date: 2026-02-05
-- Description: Remplace le champ libre 'notes' par deux champs structurés
--              pour améliorer l'UX et permettre des analyses
-- =====================================================

-- Ajouter les colonnes table_number et customer_name à la table tickets
ALTER TABLE tickets 
  ADD COLUMN IF NOT EXISTS table_number INTEGER,
  ADD COLUMN IF NOT EXISTS customer_name TEXT;

-- Créer un index pour les recherches par table (uniquement si valeur présente)
CREATE INDEX IF NOT EXISTS idx_tickets_table_number 
  ON tickets(table_number) 
  WHERE table_number IS NOT NULL;

-- Créer un index pour les recherches par client (uniquement si valeur présente)
CREATE INDEX IF NOT EXISTS idx_tickets_customer_name 
  ON tickets(customer_name) 
  WHERE customer_name IS NOT NULL;

-- Commentaires pour documentation
COMMENT ON COLUMN tickets.table_number IS 'Numéro de table (optionnel) - permet filtrage et analytics par table';
COMMENT ON COLUMN tickets.customer_name IS 'Nom du client (optionnel) - pour personnalisation et suivi client';

-- Message de confirmation
DO $$
BEGIN
  RAISE NOTICE '✅ Colonnes table_number et customer_name ajoutées à la table tickets';
END $$;
