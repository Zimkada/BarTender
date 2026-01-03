-- MIGRATION: Corriger sold_by pour les ventes créées en mode simplifié
-- DATE: 2026-01-03
-- OBJECTIF: Les ventes créées par un gérant/promoteur doivent avoir sold_by = serveur, pas = gérant
--
-- CONTEXTE:
-- Bug identifié: En mode simplifié, sold_by était défini à currentSession.userId (le gérant/promoteur)
-- au lieu de serverId (le serveur sélectionné).
--
-- IMPACT:
-- - Serveurs ne voyaient pas leurs ventes (filtrage sur sold_by OR serverId échouait)
-- - Métriques affichaient 0 pour les serveurs
-- - Ventes attribuées à des promoteurs au lieu des serveurs

BEGIN;

-- =====================================================
-- ÉTAPE 1: Identifier les ventes problématiques
-- =====================================================
-- Ventes créées par un gérant/promoteur AVEC un serveur assigné (server_id)
-- mais sold_by = created_by au lieu de sold_by = server_id

SELECT
    COUNT(*) AS ventes_a_corriger,
    MIN(created_at) AS premiere_vente,
    MAX(created_at) AS derniere_vente
FROM public.sales s
WHERE s.status = 'validated'
  AND s.server_id IS NOT NULL
  AND s.sold_by IS NOT NULL
  AND s.sold_by = s.created_by  -- Le problème: sold_by = créateur au lieu de serveur
  AND EXISTS (
    SELECT 1 FROM public.bar_members bm
    WHERE bm.user_id = s.created_by
      AND bm.bar_id = s.bar_id
      AND bm.role IN ('gerant', 'promoteur', 'super_admin')
  );

-- =====================================================
-- ÉTAPE 2: Corriger sold_by pour ces ventes
-- =====================================================
UPDATE public.sales s
SET sold_by = s.server_id,
    updated_at = NOW()
WHERE s.status = 'validated'
  AND s.server_id IS NOT NULL
  AND s.sold_by IS NOT NULL
  AND s.sold_by = s.created_by  -- Le problème: sold_by = créateur
  AND EXISTS (
    SELECT 1 FROM public.bar_members bm
    WHERE bm.user_id = s.created_by
      AND bm.bar_id = s.bar_id
      AND bm.role IN ('gerant', 'promoteur', 'super_admin')
  );

-- =====================================================
-- ÉTAPE 3: Vérifier le résultat
-- =====================================================
SELECT
    COUNT(*) AS ventes_corrigees
FROM public.sales s
WHERE s.status = 'validated'
  AND s.server_id IS NOT NULL
  AND s.sold_by = s.server_id  -- Vérifier que la correction est faite
  AND EXISTS (
    SELECT 1 FROM public.bar_members bm
    WHERE bm.user_id = s.created_by
      AND bm.bar_id = s.bar_id
      AND bm.role IN ('gerant', 'promoteur', 'super_admin')
  );

-- Résultat attendu: Même nombre que dans ÉTAPE 1

-- =====================================================
-- ÉTAPE 4: Vérifier qu'aucune incohérence ne reste
-- =====================================================
SELECT
    COUNT(*) AS problemes_restants
FROM public.sales s
WHERE s.status = 'validated'
  AND s.server_id IS NOT NULL
  AND s.sold_by != s.server_id
  AND EXISTS (
    SELECT 1 FROM public.bar_members bm
    WHERE bm.user_id = s.created_by
      AND bm.bar_id = s.bar_id
      AND bm.role IN ('gerant', 'promoteur', 'super_admin')
  );

-- Résultat attendu: 0

COMMIT;
