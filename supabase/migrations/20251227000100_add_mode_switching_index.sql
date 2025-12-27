-- Migration: Index mode switching pour performance cross-mode
-- Description: Optimise requêtes serverId || createdBy (mode Simplifié/Complet)
-- Compatibilité: Supabase Free + Pro
-- Date: 2025-12-27
-- Note: CONCURRENTLY retiré car migrations Supabase s'exécutent dans une transaction

-- =====================================================
-- Index pour pattern mode-agnostic: COALESCE(server_id, created_by)
-- =====================================================

-- Index composite pour ventes mode switching
-- Utilisé par: Performance Équipe, Historique Ventes, Top Produits
CREATE INDEX IF NOT EXISTS idx_sales_mode_switching
ON sales(bar_id, COALESCE(server_id, created_by), created_at DESC)
WHERE status = 'validated';

-- Index composite pour retours mode switching
-- Utilisé par: Historique Retours, Performance Équipe (déductions)
-- Note: returns n'a pas server_id, utilise returned_by pour mode-agnostic
CREATE INDEX IF NOT EXISTS idx_returns_mode_switching
ON returns(bar_id, returned_by, returned_at DESC)
WHERE status IN ('approved', 'restocked');

-- Index composite pour consignations mode switching
-- Utilisé par: Page Consignations, déduction seller
-- Note: consignments n'a pas server_id, utilise original_seller
CREATE INDEX IF NOT EXISTS idx_consignments_mode_switching
ON consignments(bar_id, original_seller, status, created_at DESC);

-- =====================================================
-- Index pour RPC top_products_by_server (mode switching)
-- =====================================================

-- Optimise clause OR dans RPC: server_id = X OR created_by = X
-- Note: L'index COALESCE ci-dessus ne peut pas être utilisé pour OR
CREATE INDEX IF NOT EXISTS idx_sales_server_id_validated
ON sales(server_id, created_at DESC)
WHERE status = 'validated' AND server_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_created_by_validated
ON sales(created_by, created_at DESC)
WHERE status = 'validated' AND created_by IS NOT NULL;

-- Commentaires
COMMENT ON INDEX idx_sales_mode_switching IS
'Optimise requêtes mode-agnostic (serverId || createdBy) pour cross-mode compatibility';

COMMENT ON INDEX idx_returns_mode_switching IS
'Optimise retours mode-agnostic pour Performance Équipe et Historique';

COMMENT ON INDEX idx_consignments_mode_switching IS
'Optimise consignations mode-agnostic pour affichage seller correct';

COMMENT ON INDEX idx_sales_server_id_validated IS
'Optimise clause OR (server_id = X) dans RPC top_products_by_server';

COMMENT ON INDEX idx_sales_created_by_validated IS
'Optimise clause OR (created_by = X) dans RPC top_products_by_server';
