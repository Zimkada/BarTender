-- =====================================================
-- PHASE 0 : BACKUP PERMANENT AVANT NETTOYAGE
-- =====================================================
-- Migration: Créer backup permanent des produits avant modifications
-- Date: 2026-01-09
-- Objectif: Sauvegarder tous les produits actifs pour rollback si nécessaire

BEGIN;

-- ✅ CORRECTION SÉCURITÉ: Table PERMANENTE (pas TEMP)
-- Raison: Table TEMP disparaît à la fin de session, backup perdu si échec

-- Créer table de backup avec timestamp
CREATE TABLE IF NOT EXISTS bar_products_backup_20260109 (
    -- Copie exacte de bar_products
    id UUID,
    bar_id UUID,
    global_product_id UUID,
    local_name TEXT,
    local_image TEXT,
    local_category_id UUID,
    price NUMERIC(12, 2),
    stock INTEGER,
    alert_threshold INTEGER,
    is_custom_product BOOLEAN,
    is_active BOOLEAN,
    created_at TIMESTAMPTZ,
    volume TEXT,
    current_average_cost NUMERIC(12, 2),
    
    -- Métadonnées backup
    backup_created_at TIMESTAMPTZ DEFAULT NOW(),
    backup_reason TEXT DEFAULT 'Backup avant nettoyage doublons'
);

-- Insérer tous les produits actifs du bar client
INSERT INTO bar_products_backup_20260109 (
    id, bar_id, global_product_id, local_name, local_image,
    local_category_id, price, stock, alert_threshold,
    is_custom_product, is_active, created_at, volume, current_average_cost
)
SELECT 
    id, bar_id, global_product_id, local_name, local_image,
    local_category_id, price, stock, alert_threshold,
    is_custom_product, is_active, created_at, volume, current_average_cost
FROM bar_products
WHERE bar_id = '5cfff673-51b5-414a-a563-66681211a98a'
  AND is_active = true;

-- ✅ CORRECTION: Vérification APRÈS INSERT (pas avant)
DO $$
DECLARE
    v_backup_count INT;
    v_original_count INT;
BEGIN
    SELECT COUNT(*) INTO v_backup_count FROM bar_products_backup_20260109;
    SELECT COUNT(*) INTO v_original_count FROM bar_products 
    WHERE bar_id = '5cfff673-51b5-414a-a563-66681211a98a' AND is_active = true;
    
    RAISE NOTICE '✅ Backup créé: % produits sauvegardés (original: %)', v_backup_count, v_original_count;
    
    IF v_backup_count != v_original_count THEN
        RAISE EXCEPTION 'Erreur backup: nombre de produits différent!';
    END IF;
END $$;

-- Permissions (lecture seule pour authenticated, admin peut restaurer)
GRANT SELECT ON bar_products_backup_20260109 TO authenticated;
GRANT ALL ON bar_products_backup_20260109 TO service_role;

-- Commentaire
COMMENT ON TABLE bar_products_backup_20260109 IS 
'Backup permanent des produits actifs avant nettoyage doublons du 2026-01-09. 
Utiliser pour rollback si nécessaire.';

COMMIT;

-- =====================================================
-- SCRIPT DE RESTAURATION (À UTILISER SI PROBLÈME)
-- =====================================================
/*
-- Pour restaurer les produits depuis le backup:

BEGIN;

-- Désactiver tous les produits actuels
UPDATE bar_products 
SET is_active = false 
WHERE bar_id = '5cfff673-51b5-414a-a563-66681211a98a';

-- Restaurer depuis backup
INSERT INTO bar_products (
    id, bar_id, global_product_id, local_name, local_image,
    local_category_id, price, stock, alert_threshold,
    is_custom_product, is_active, created_at, volume, current_average_cost
)
SELECT 
    id, bar_id, global_product_id, local_name, local_image,
    local_category_id, price, stock, alert_threshold,
    is_custom_product, is_active, created_at, volume, current_average_cost
FROM bar_products_backup_20260109
ON CONFLICT (id) DO UPDATE SET
    is_active = EXCLUDED.is_active,
    stock = EXCLUDED.stock,
    price = EXCLUDED.price;

COMMIT;
*/
