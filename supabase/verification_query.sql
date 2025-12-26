-- =====================================================
-- REQUÊTES DE VÉRIFICATION DES MIGRATIONS
-- =====================================================
-- Exécute ces requêtes dans l'éditeur SQL de Supabase pour vérifier
-- que toutes les colonnes existent et contiennent des données

-- =====================================================
-- 1. Vérifier que les colonnes existent
-- =====================================================
-- Cette requête devrait retourner les 3 colonnes (sales, consignments, returns)
SELECT
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('sales', 'consignments', 'returns')
  AND column_name IN ('server_id', 'operating_mode_at_creation')
ORDER BY table_name, column_name;

-- =====================================================
-- 2. Vérifier les données dans la table returns
-- =====================================================
-- Compte combien de retours ont server_id et operating_mode_at_creation
SELECT
    COUNT(*) as total_returns,
    COUNT(server_id) as with_server_id,
    COUNT(server_id) * 100.0 / NULLIF(COUNT(*), 0) as percent_with_server_id,
    COUNT(operating_mode_at_creation) as with_operating_mode,
    COUNT(CASE WHEN operating_mode_at_creation = 'full' THEN 1 END) as mode_full,
    COUNT(CASE WHEN operating_mode_at_creation = 'simplified' THEN 1 END) as mode_simplified
FROM public.returns;

-- =====================================================
-- 3. Voir un exemple de retour avec toutes les colonnes
-- =====================================================
-- Affiche les 5 retours les plus récents avec tous les champs importants
SELECT
    r.id,
    r.bar_id,
    r.sale_id,
    r.product_name,
    r.server_id,
    r.returned_by,
    r.operating_mode_at_creation,
    r.returned_at,
    -- Joindre avec users pour voir le nom du serveur
    u.name as server_name,
    u2.name as returned_by_name
FROM public.returns r
LEFT JOIN public.users u ON u.id = r.server_id
LEFT JOIN public.users u2 ON u2.id = r.returned_by
ORDER BY r.returned_at DESC
LIMIT 5;

-- =====================================================
-- 4. Vérifier la cohérence server_id entre sales et returns
-- =====================================================
-- Pour chaque retour, affiche le server_id de la vente associée
SELECT
    r.id as return_id,
    r.product_name,
    r.server_id as return_server_id,
    s.server_id as sale_server_id,
    CASE
        WHEN r.server_id = s.server_id THEN '✅ Cohérent'
        WHEN r.server_id IS NULL THEN '❌ Retour sans server_id'
        WHEN s.server_id IS NULL THEN '❌ Vente sans server_id'
        ELSE '⚠️ Incohérent'
    END as status,
    u.name as server_name
FROM public.returns r
LEFT JOIN public.sales s ON s.id = r.sale_id
LEFT JOIN public.users u ON u.id = r.server_id
ORDER BY r.returned_at DESC
LIMIT 10;

-- =====================================================
-- 5. Vérifier les données dans la table sales
-- =====================================================
SELECT
    COUNT(*) as total_sales,
    COUNT(server_id) as with_server_id,
    COUNT(server_id) * 100.0 / NULLIF(COUNT(*), 0) as percent_with_server_id,
    COUNT(operating_mode_at_creation) as with_operating_mode,
    COUNT(CASE WHEN operating_mode_at_creation = 'full' THEN 1 END) as mode_full,
    COUNT(CASE WHEN operating_mode_at_creation = 'simplified' THEN 1 END) as mode_simplified
FROM public.sales;

-- =====================================================
-- 6. Vérifier si la fonction RPC existe
-- =====================================================
SELECT
    routine_name,
    routine_type,
    data_type as return_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name LIKE '%top_products%'
ORDER BY routine_name;

-- =====================================================
-- 7. Tester la structure de la table returns
-- =====================================================
-- Affiche la définition complète de la table returns
SELECT
    column_name,
    data_type,
    character_maximum_length,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'returns'
ORDER BY ordinal_position;
