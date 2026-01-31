-- ==============================================================================
-- MIGRATION: 20260201_optimize_scalability_v2
-- DESCRIPTION: Consolidation du schéma (business_date) et Ajout d'Index Critiques
-- OBJECTIF: Préparer la base pour >1M ventes/an et 100+ bars
-- ==============================================================================

BEGIN;

-- 1. CONSOLIDATION DU SCHÉMA ("Schema Drift" Fix)
-- La colonne business_date existe en prod mais manquait dans les migrations locales.
-- On l'ajoute formellement pour que les futurs environnements soient ISO-Prod.

DO $$
BEGIN
    -- DOCUMENTATION: business_date existe depuis le début de l'app
    -- Cette migration documente son existence pour futurs environnements from scratch
    -- En prod, cette colonne existe déjà et est utilisée partout
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'business_date') THEN
        ALTER TABLE sales ADD COLUMN business_date DATE NOT NULL DEFAULT CURRENT_DATE;
        COMMENT ON COLUMN sales.business_date IS 'Date comptable (Shift) - Critique pour Analytics & Clôture. Utilisée depuis le début de l''app.';
    END IF;
END $$;


-- 2. INDEXES DE CLÉS ÉTRANGÈRES (FKs) MANQUANTS
-- Accélère les jointures et les suppressions en cascade

-- Sales Table
CREATE INDEX IF NOT EXISTS idx_sales_validated_by ON sales(validated_by); 
CREATE INDEX IF NOT EXISTS idx_sales_rejected_by ON sales(rejected_by);

-- Expenses Table
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
CREATE INDEX IF NOT EXISTS idx_expenses_related_supply ON expenses(related_supply_id);

-- Supplies Table
CREATE INDEX IF NOT EXISTS idx_supplies_supplied_by ON supplies(supplied_by);


-- 3. INDEXES JSONB (Gin Index)
-- Critique pour la recherche dans les objets JSON (Produits vendus, Promos)

-- Permet de chercher: "Quelles ventes contiennent le produit X ?"
CREATE INDEX IF NOT EXISTS idx_sales_items_gin ON sales USING GIN (items);

-- Permet de chercher: "Quelles ventes ont utilisé la promo Y ?"
CREATE INDEX IF NOT EXISTS idx_sales_applied_promotions_gin ON sales USING GIN (applied_promotions);


-- 4. INDEXES ANALYTICS & STRATÉGIQUES
-- Optimise les Dashboards et Rapports

-- Dashboard Ventes: Filtrer par Bar + Statut + Date (Le pattern le plus fréquent)
-- ORDER: status (Égalité) avant business_date (Range) pour performance maximale
CREATE INDEX IF NOT EXISTS idx_sales_bar_status_date_composite
ON sales(bar_id, status, business_date DESC);

-- Dashboard Revenue: Agrégations SUM(total) par jour (évite table scan)
-- INCLUDE évite lecture table principale pour les colonnes incluses
CREATE INDEX IF NOT EXISTS idx_sales_revenue_analytics
ON sales(bar_id, status, business_date DESC)
INCLUDE (total, discount_total);

-- Sécurité / RLS: Accélère la vérification des droits par bar
-- (Souvent bar_members est joint, idx_bar_members_user_id existe déjà)


-- 5. NETTOYAGE / COMMENTAIRES
COMMENT ON INDEX idx_sales_bar_status_date_composite IS 'Optimise le chargement du Dashboard Ventes (Top queries)';
COMMENT ON INDEX idx_sales_items_gin IS 'Permet la recherche rapide de produits dans l''historique des ventes';

COMMIT;
