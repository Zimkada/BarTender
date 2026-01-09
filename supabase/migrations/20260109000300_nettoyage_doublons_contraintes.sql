-- =====================================================
-- PHASE 1 : NETTOYAGE DOUBLONS ET CONTRAINTES
-- =====================================================
-- Migration: Nettoyer doublons et ajouter contraintes UNIQUE
-- Date: 2026-01-09
-- Objectif: Appliquer décisions manuelles et empêcher futurs doublons

-- ⚠️ PRÉREQUIS:
-- 1. Migration 20260109000000 exécutée (rapport généré)
-- 2. Migration 20260109000100 exécutée (backup créé)
-- 3. Migration 20260109000200 exécutée (table decisions créée)
-- 4. Table product_cleanup_decisions REMPLIE avec vos décisions

BEGIN;

-- =====================================================
-- ÉTAPE 1: VÉRIFICATIONS PRÉ-MIGRATION
-- =====================================================

DO $$
DECLARE
    v_backup_count INT;
    v_products_count INT;
BEGIN
    -- Vérifier backup existe
    SELECT COUNT(*) INTO v_backup_count FROM bar_products_backup_20260109;
    IF v_backup_count = 0 THEN
        RAISE EXCEPTION 'Backup vide! Exécuter migration 20260109000100 d''abord';
    END IF;

    -- Compter produits actifs
    SELECT COUNT(*) INTO v_products_count FROM bar_products
    WHERE bar_id = '5cfff673-51b5-414a-a563-66681211a98a' AND is_active = true;

    RAISE NOTICE '✅ Vérifications OK: % produits en backup, % produits actifs avant nettoyage',
        v_backup_count, v_products_count;
END $$;

-- =====================================================
-- ÉTAPE 2: DÉSACTIVER LES DOUBLONS (GARDER LE PLUS RÉCENT)
-- =====================================================

-- Identifier et désactiver les doublons (garder rn=1 = le plus récent)
WITH duplicates AS (
  SELECT
    id,
    local_name,
    ROW_NUMBER() OVER (PARTITION BY bar_id, local_name ORDER BY created_at DESC) as rn
  FROM bar_products
  WHERE bar_id = '5cfff673-51b5-414a-a563-66681211a98a'
    AND is_active = true
)
UPDATE bar_products
SET is_active = false
WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

-- Log des produits désactivés
INSERT INTO audit_logs (
    event, severity, user_id, user_name, user_role,
    bar_id, bar_name, description, metadata
)
SELECT
    'PRODUCT_CLEANUP',
    'info',
    NULL,
    'Système',
    'admin',
    bp.bar_id,
    b.name,
    'Doublon désactivé: ' || bp.local_name || ' (ancien, gardé le plus récent)',
    jsonb_build_object(
        'product_id', bp.id,
        'local_name', bp.local_name,
        'action', 'deactivate_duplicate'
    )
FROM bar_products bp
JOIN bars b ON b.id = bp.bar_id
WHERE bp.bar_id = '5cfff673-51b5-414a-a563-66681211a98a'
  AND bp.is_active = false
  AND bp.created_at >= '2026-01-05';

-- =====================================================
-- ÉTAPE 3: DÉSACTIVER ANCIENS PRODUITS INACTIFS
-- =====================================================

-- Désactiver produits inactifs créés avant 2026-01-05
UPDATE bar_products
SET is_active = false
WHERE bar_id = '5cfff673-51b5-414a-a563-66681211a98a'
  AND created_at < '2026-01-05'
  AND is_active = false; -- Déjà inactifs, mais pour audit

-- Log
INSERT INTO audit_logs (
    event, severity, user_id, user_name, user_role, bar_id, bar_name, description, metadata
)
SELECT
    'PRODUCT_ARCHIVE',
    'info',
    NULL,
    'Système',
    'admin',
    bar_id,
    (SELECT name FROM bars WHERE id = '5cfff673-51b5-414a-a563-66681211a98a'),
    'Archivage anciens produits inactifs (avant 2026-01-05)',
    jsonb_build_object(
        'count', COUNT(*),
        'bar_id', bar_id
    )
FROM bar_products
WHERE bar_id = '5cfff673-51b5-414a-a563-66681211a98a'
  AND created_at < '2026-01-05'
  AND is_active = false
GROUP BY bar_id;

-- =====================================================
-- ÉTAPE 4: AJOUTER CONTRAINTES UNIQUE
-- =====================================================

-- ✅ CORRECTION: Index UNIQUE partiel (compatible PostgreSQL < 15)
-- Raison: Empêcher doublons GLOBAUX uniquement (custom peuvent avoir même nom)

-- Index UNIQUE partiel: Produits globaux (pas de doublons global_product_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_global_product
ON bar_products(bar_id, global_product_id)
WHERE is_active = true AND global_product_id IS NOT NULL;

-- ❌ PAS de contrainte sur produits custom
-- Raison: Trop restrictive - deux produits custom peuvent avoir le même nom
-- Example: "Coca perso barmaid1" vs "Coca perso barmaid2"

-- =====================================================
-- ÉTAPE 5: VÉRIFICATIONS POST-MIGRATION
-- =====================================================

DO $$
DECLARE
    v_duplicates_count INT;
    v_active_count INT;
    v_deactivated_count INT;
BEGIN
    -- Vérifier aucun doublon actif ne reste
    SELECT COUNT(*) INTO v_duplicates_count
    FROM (
        SELECT local_name, COUNT(*) as cnt
        FROM bar_products
        WHERE bar_id = '5cfff673-51b5-414a-a563-66681211a98a'
          AND is_active = true
        GROUP BY local_name
        HAVING COUNT(*) > 1
    ) duplicates;
    
    IF v_duplicates_count > 0 THEN
        RAISE WARNING 'Attention: % doublons actifs restants!', v_duplicates_count;
    ELSE
        RAISE NOTICE '✅ Aucun doublon actif restant';
    END IF;
    
    -- Compter produits actifs/désactivés
    SELECT 
        COUNT(*) FILTER (WHERE is_active = true),
        COUNT(*) FILTER (WHERE is_active = false)
    INTO v_active_count, v_deactivated_count
    FROM bar_products
    WHERE bar_id = '5cfff673-51b5-414a-a563-66681211a98a';
    
    RAISE NOTICE '✅ Résultat final: % produits actifs, % désactivés', 
        v_active_count, v_deactivated_count;
END $$;

COMMIT;

-- =====================================================
-- RAPPORT POST-MIGRATION
-- =====================================================
/*
-- Exécuter après migration pour vérifier:

-- 1. Vérifier aucun doublon
SELECT local_name, COUNT(*) as count
FROM bar_products
WHERE bar_id = '5cfff673-51b5-414a-a563-66681211a98a'
  AND is_active = true
GROUP BY local_name
HAVING COUNT(*) > 1;
-- Doit retourner 0 lignes

-- 2. Compter produits actifs
SELECT COUNT(*) as total_active
FROM bar_products
WHERE bar_id = '5cfff673-51b5-414a-a563-66681211a98a' 
  AND is_active = true;

-- 3. Vérifier contraintes appliquées
SELECT conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'bar_products'::regclass
  AND conname LIKE 'unique_active%';

-- 4. Vérifier audit logs
SELECT event, description, metadata
FROM audit_logs
WHERE event IN ('PRODUCT_CLEANUP', 'PRODUCT_ARCHIVE')
ORDER BY timestamp DESC
LIMIT 20;
*/
