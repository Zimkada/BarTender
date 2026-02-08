-- =====================================================
-- Migration: Ajouter idempotency_key à sales
-- Date: 2026-02-05
-- Objectif: Prévenir les doublons de ventes en mode offline
-- =====================================================

-- Ajouter la colonne idempotency_key à la table sales
ALTER TABLE sales ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Créer un index unique sur idempotency_key pour bar_id
-- Permet de détecter rapidement les doublons par bar
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_idempotency_key
ON sales(bar_id, idempotency_key)
WHERE idempotency_key IS NOT NULL;

-- Créer un index standard pour les lookups rapides
CREATE INDEX IF NOT EXISTS idx_sales_idempotency_key_lookup
ON sales(idempotency_key)
WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN sales.idempotency_key IS
'Clé d''idempotence pour prévenir les doublons lors de la synchronisation offline. Format: sync_timestamp_random';
