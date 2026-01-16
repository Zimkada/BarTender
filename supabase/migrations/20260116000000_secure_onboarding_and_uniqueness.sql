-- =====================================================
-- MIGRATION: 20260116000000_secure_onboarding_and_uniqueness.sql
-- Description: Sécurisation de l'onboarding et de l'unicité des données
-- =====================================================

BEGIN;

-- 1. NETTOYAGE DES DOUBLONS EXISTANTS (bar_products)
-- On ne garde que le plus récent pour chaque couple (bar_id, local_name) actif
WITH duplicates AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY bar_id, local_name 
               ORDER BY created_at DESC
           ) as rn
    FROM bar_products
    WHERE is_active = true AND local_name IS NOT NULL
)
UPDATE bar_products
SET is_active = false
WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

-- 2. AJOUT DE LA CONTRAINTE UNIQUE SUR LES PRODUITS CUSTOM
-- Unicité par bar pour les produits actifs
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_bar_product_name
ON bar_products(bar_id, local_name)
WHERE is_active = true AND local_name IS NOT NULL;

-- 3. NETTOYAGE DES DOUBLONS EXISTANTS (supplies)
-- On ne garde que l'entrée la plus récente en cas de doublon exact (bar, produit, date)
WITH supply_duplicates AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY bar_id, product_id, supplied_at 
               ORDER BY created_at DESC
           ) as rn
    FROM supplies
)
DELETE FROM supplies
WHERE id IN (SELECT id FROM supply_duplicates WHERE rn > 1);

-- 4. AJOUT DE LA CONTRAINTE UNIQUE SUR LES APPROVISIONNEMENTS
ALTER TABLE supplies 
ADD CONSTRAINT unique_bar_product_supply_date 
UNIQUE (bar_id, product_id, supplied_at);

-- 5. CORRECTION DU PROBLÈME DES IDS SERVEURS (UUID)
-- On rend user_id optionnel dans bar_members pour supporter les serveurs "virtuels" du mode simplifié
-- Et on ajoute une colonne pour stocker le nom du serveur virtuel
ALTER TABLE bar_members ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE bar_members ADD COLUMN IF NOT EXISTS virtual_server_name TEXT;

-- Mise à jour de la contrainte d'unicité pour bar_members
-- On supprime l'ancienne contrainte (user_id, bar_id) qui empêchait les user_id NULL
-- Note: Le nom peut varier selon l'installation, on tente les noms les plus courants
ALTER TABLE bar_members DROP CONSTRAINT IF EXISTS bar_members_user_id_bar_id_key;
ALTER TABLE bar_members DROP CONSTRAINT IF EXISTS bar_members_bar_id_user_id_key;

-- On remplace par des index filtrés pour permettre plusieurs serveurs virtuels (user_id IS NULL)
-- tout en gardant l'unicité pour les utilisateurs réels
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_bar_member_user 
ON bar_members(bar_id, user_id) 
WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_bar_member_virtual 
ON bar_members(bar_id, virtual_server_name) 
WHERE virtual_server_name IS NOT NULL;

COMMIT;

-- Rapport d'exécution
DO $$
BEGIN
    RAISE NOTICE '✅ Migration de sécurisation terminée avec succès.';
    RAISE NOTICE '- Doublons bar_products nettoyés et index UNIQUE ajouté.';
    RAISE NOTICE '- Doublons supplies nettoyés et contrainte UNIQUE ajoutée.';
    RAISE NOTICE '- bar_members.user_id est maintenant optionnel pour le mode simplifié.';
END $$;
