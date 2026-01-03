-- DIAGNOSTIC: Vérifier l'attribution des ventes (sold_by, server_id, created_by)
-- DATE: 2026-01-03
-- OBJECTIF: Identifier pourquoi les serveurs ne voient pas leurs ventes

-- =====================================================
-- 1. Vérifier l'existence de la FK sales_sold_by_fkey
-- =====================================================
SELECT
    conname AS constraint_name,
    conrelid::regclass AS table_name,
    confrelid::regclass AS referenced_table
FROM pg_constraint
WHERE conname = 'sales_sold_by_fkey';

-- Résultat attendu: Une ligne avec sales -> users
-- Si vide: La FK n'existe pas en production ❌

-- =====================================================
-- 2. Vérifier les ventes d'aujourd'hui (business_date)
-- =====================================================
SELECT
    id,
    business_date,
    status,
    total,
    created_by,
    sold_by,
    server_id,
    created_at
FROM public.sales
WHERE business_date = (
    SELECT business_date
    FROM public.sales
    WHERE status = 'validated'
    ORDER BY created_at DESC
    LIMIT 1
)
ORDER BY created_at DESC
LIMIT 20;

-- Vérifier:
-- - sold_by est-il rempli? (NOT NULL)
-- - sold_by = server_id en mode simplifié?
-- - sold_by = created_by en mode complet?

-- =====================================================
-- 3. Identifier les ventes avec sold_by manquant/NULL
-- =====================================================
SELECT
    COUNT(*) AS ventes_sold_by_null,
    MIN(created_at) AS premiere_vente_null,
    MAX(created_at) AS derniere_vente_null
FROM public.sales
WHERE sold_by IS NULL;

-- Résultat attendu: 0 ventes avec sold_by NULL
-- Si > 0: Problème de remplissage du champ ❌

-- =====================================================
-- 4. Identifier les incohérences en mode simplifié
-- =====================================================
-- En mode simplifié: sold_by devrait = server_id
SELECT
    id,
    business_date,
    total,
    created_by,
    sold_by,
    server_id,
    status
FROM public.sales
WHERE server_id IS NOT NULL
  AND sold_by IS NOT NULL
  AND sold_by != server_id
  AND status = 'validated'
  AND business_date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY created_at DESC
LIMIT 20;

-- Résultat attendu: 0 lignes (aucune incohérence)
-- Si > 0: sold_by ne correspond pas au server_id assigné ❌

-- =====================================================
-- 5. Vérifier la vente de 800 mentionnée par le user
-- =====================================================
SELECT
    id,
    business_date,
    total,
    created_by,
    sold_by,
    server_id,
    status,
    created_at,
    validated_at
FROM public.sales
WHERE total = 800
  AND status = 'validated'
  AND business_date >= CURRENT_DATE - INTERVAL '3 days'
ORDER BY created_at DESC;

-- Vérifier:
-- - sold_by = UUID du serveur? Ou = UUID du gérant?
-- - server_id = UUID du serveur?

-- =====================================================
-- 6. Statistiques globales par bar
-- =====================================================
SELECT
    bar_id,
    COUNT(*) AS total_ventes,
    COUNT(CASE WHEN sold_by IS NULL THEN 1 END) AS sold_by_null,
    COUNT(CASE WHEN server_id IS NULL THEN 1 END) AS server_id_null,
    COUNT(CASE WHEN sold_by != server_id AND server_id IS NOT NULL THEN 1 END) AS incohérences_sold_by_server_id,
    COUNT(CASE WHEN sold_by = created_by THEN 1 END) AS ventes_mode_complet,
    COUNT(CASE WHEN sold_by != created_by THEN 1 END) AS ventes_mode_simplifié
FROM public.sales
WHERE status = 'validated'
  AND business_date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY bar_id;

-- Interprétation:
-- - sold_by_null doit être 0
-- - incohérences_sold_by_server_id doit être 0
-- - ventes_mode_complet: sold_by = created_by (serveur crée sa propre vente)
-- - ventes_mode_simplifié: sold_by != created_by (gérant crée pour serveur)

-- =====================================================
-- 7. Voir les détails des utilisateurs (serveur vs gérant)
-- =====================================================
SELECT
    s.id AS sale_id,
    s.business_date,
    s.total,
    s.status,
    creator.id AS creator_id,
    creator.name AS creator_name,
    bm_creator.role AS creator_role,
    seller.id AS seller_id,
    seller.name AS seller_name,
    bm_seller.role AS seller_role,
    server.id AS server_id_user,
    server.name AS server_name,
    bm_server.role AS server_role
FROM public.sales s
LEFT JOIN public.users creator ON s.created_by = creator.id
LEFT JOIN public.bar_members bm_creator ON creator.id = bm_creator.user_id AND bm_creator.bar_id = s.bar_id
LEFT JOIN public.users seller ON s.sold_by = seller.id
LEFT JOIN public.bar_members bm_seller ON seller.id = bm_seller.user_id AND bm_seller.bar_id = s.bar_id
LEFT JOIN public.users server ON s.server_id = server.id
LEFT JOIN public.bar_members bm_server ON server.id = bm_server.user_id AND bm_server.bar_id = s.bar_id
WHERE s.status = 'validated'
  AND s.business_date >= CURRENT_DATE - INTERVAL '3 days'
ORDER BY s.created_at DESC
LIMIT 20;

-- Vérifier:
-- - seller_role doit être 'serveur' (pas 'gerant' ou 'promoteur')
-- - En mode simplifié: creator_role = 'gerant/promoteur', seller_role = 'serveur'
-- - En mode complet: creator_role = seller_role = 'serveur'
