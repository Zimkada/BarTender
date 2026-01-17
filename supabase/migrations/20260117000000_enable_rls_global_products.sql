-- =====================================================
-- MIGRATION: Re-enable RLS and cleanup duplicate policies
-- Description: 1. Réactive la sécurité RLS sur global_products
--              2. Supprime la politique obsolète en double
--              3. Garde uniquement les policies enrichment-layer
-- Date: 2026-01-17
-- =====================================================

BEGIN;

-- =====================================================
-- SUPPRESSION : Politique en double obsolète
-- =====================================================
DROP POLICY IF EXISTS "Super admins can insert global products" ON global_products;

-- =====================================================
-- RÉACTIVER RLS sur global_products
-- =====================================================
ALTER TABLE global_products ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- VÉRIFICATION : Les policies actuelles
-- =====================================================
-- SELECT : "Authenticated users can view global products" (true)
-- INSERT : "Super admins can create global products - enrichment layer" (enriched validation)
-- UPDATE : "Super admins can update global products - enrichment layer"
-- DELETE : "Super admins can delete global products - enrichment layer"

-- =====================================================
-- LOG
-- =====================================================
DO $$
BEGIN
  RAISE NOTICE '✅ RLS réactivé sur global_products table';
  RAISE NOTICE '✅ Politique obsolète "Super admins can insert global products" supprimée';
  RAISE NOTICE '';
  RAISE NOTICE 'Policies actuelles (enrichment-layer):';
  RAISE NOTICE '- SELECT : Tous les utilisateurs authentifiés (true)';
  RAISE NOTICE '- INSERT : Super admins uniquement + validation champs requis';
  RAISE NOTICE '- UPDATE : Super admins uniquement';
  RAISE NOTICE '- DELETE : Super admins uniquement (soft delete)';
  RAISE NOTICE '';
  RAISE NOTICE 'Layer 3 (RLS) security is now ACTIVE and CLEAN';
END $$;

COMMIT;
