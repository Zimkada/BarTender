-- =====================================================
-- PHASE 1 : TABLE DE DÉCISIONS MANUELLES
-- =====================================================
-- Migration: Créer table pour décisions manuelles de nettoyage
-- Date: 2026-01-09
-- Objectif: Permettre validation manuelle produit par produit

BEGIN;

-- ✅ CORRECTION SÉCURITÉ: Ajout ON DELETE CASCADE
-- Raison: Éviter orphelins si produit supprimé

CREATE TABLE IF NOT EXISTS product_cleanup_decisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES bar_products(id) ON DELETE CASCADE,
    action TEXT NOT NULL CHECK (action IN ('keep', 'deactivate', 'merge')),
    final_stock INT CHECK (final_stock >= 0),
    notes TEXT,
    decided_at TIMESTAMPTZ DEFAULT NOW(),
    decided_by UUID REFERENCES users(id),
    
    -- Métadonnées pour audit
    original_stock INT,
    original_price NUMERIC(12, 2),
    
    UNIQUE(product_id) -- Un produit = une seule décision
);

-- Index pour performance
CREATE INDEX idx_cleanup_decisions_action ON product_cleanup_decisions(action);
CREATE INDEX idx_cleanup_decisions_decided_at ON product_cleanup_decisions(decided_at DESC);

-- Permissions
GRANT SELECT ON product_cleanup_decisions TO authenticated;
GRANT ALL ON product_cleanup_decisions TO service_role;

-- Commentaire
COMMENT ON TABLE product_cleanup_decisions IS 
'Décisions manuelles pour nettoyage des doublons de produits. 
Remplir cette table AVANT d''exécuter la migration de nettoyage automatique.';

COMMENT ON COLUMN product_cleanup_decisions.action IS 
'keep: Garder ce produit actif
deactivate: Désactiver ce produit (doublon)
merge: Fusionner stock avec un autre produit';

COMMIT;

-- =====================================================
-- TEMPLATE POUR REMPLIR LES DÉCISIONS
-- =====================================================
/*
-- Exemple de décisions à prendre:

-- Cas 1: Doublon simple - Garder le plus récent
INSERT INTO product_cleanup_decisions (product_id, action, final_stock, notes, original_stock, original_price)
VALUES 
    ('uuid-produit-recent', 'keep', 160, 'Stock consolidé: 81 + 79', 81, 500),
    ('uuid-produit-ancien', 'deactivate', 0, 'Doublon, stock transféré', 79, 500);

-- Cas 2: Produit à garder tel quel
INSERT INTO product_cleanup_decisions (product_id, action, final_stock, notes, original_stock, original_price)
VALUES 
    ('uuid-produit-unique', 'keep', 50, 'Pas de doublon, garder tel quel', 50, 300);

-- Cas 3: Fusion de stocks
INSERT INTO product_cleanup_decisions (product_id, action, final_stock, notes, original_stock, original_price)
VALUES 
    ('uuid-produit-principal', 'keep', 200, 'Fusion de 3 doublons: 80+60+60', 80, 400),
    ('uuid-produit-doublon-1', 'deactivate', 0, 'Stock fusionné dans principal', 60, 400),
    ('uuid-produit-doublon-2', 'deactivate', 0, 'Stock fusionné dans principal', 60, 400);
*/
