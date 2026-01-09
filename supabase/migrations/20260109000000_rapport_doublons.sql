-- =====================================================
-- PHASE 0 : RAPPORT DES DOUBLONS
-- =====================================================
-- Migration: Générer rapport des doublons pour décision manuelle
-- Date: 2026-01-09
-- Objectif: Lister tous les doublons avec détails pour validation manuelle

-- ⚠️ IMPORTANT: Exécuter cette requête AVANT toute modification
-- Copier les résultats dans un fichier pour décision manuelle

-- Rapport détaillé des doublons
SELECT 
    local_name,
    COUNT(*) as nombre_doublons,
    STRING_AGG(
        id::text || ' | Stock: ' || stock || ' | Créé: ' || created_at::date || ' | Global: ' || COALESCE(global_product_id::text, 'CUSTOM'),
        E'\n    '
    ) as details
FROM bar_products
WHERE bar_id = '5cfff673-51b5-414a-a563-66681211a98a'
  AND is_active = true
GROUP BY local_name
HAVING COUNT(*) > 1
ORDER BY local_name;

-- Statistiques globales
SELECT 
    COUNT(DISTINCT local_name) as produits_uniques,
    COUNT(*) as total_produits_actifs,
    COUNT(*) - COUNT(DISTINCT local_name) as nombre_doublons_total
FROM bar_products
WHERE bar_id = '5cfff673-51b5-414a-a563-66681211a98a'
  AND is_active = true;

-- Liste complète des produits actifs pour référence
SELECT 
    id,
    local_name,
    stock,
    price,
    created_at::date as date_creation,
    CASE 
        WHEN global_product_id IS NOT NULL THEN 'Global: ' || global_product_id::text
        ELSE 'CUSTOM'
    END as type_produit
FROM bar_products
WHERE bar_id = '5cfff673-51b5-414a-a563-66681211a98a'
  AND is_active = true
ORDER BY local_name, created_at DESC;

-- ⚠️ INSTRUCTIONS:
-- 1. Exécuter ces requêtes
-- 2. Copier les résultats dans un fichier Excel/Google Sheets
-- 3. Pour chaque doublon, décider:
--    - Quel produit GARDER (le plus récent généralement)
--    - Quel stock final appliquer
-- 4. Remplir la table product_cleanup_decisions (migration suivante)
