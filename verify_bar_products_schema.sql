-- Requête de vérification de la structure de bar_products
-- Exécuter dans Supabase SQL Editor

-- 1. Structure complète de la table
SELECT
    column_name,
    data_type,
    character_maximum_length,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'bar_products'
ORDER BY ordinal_position;

-- 2. Exemple de données (pour voir les vraies colonnes)
SELECT * FROM bar_products LIMIT 3;

-- 3. Colonnes disponibles (liste rapide)
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'bar_products'
ORDER BY ordinal_position;

-- 4. Vérifier si c'est "name" ou "product_name"
SELECT
    CASE
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bar_products' AND column_name = 'name')
        THEN 'Colonne: name ✓'
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bar_products' AND column_name = 'product_name')
        THEN 'Colonne: product_name ✓'
        ELSE 'Aucune colonne name/product_name trouvée ✗'
    END AS result;
