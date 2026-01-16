-- =====================================================
-- MIGRATION: Add complete RLS policies for global_products
-- Description: Implémente Layer 3 (sécurité RLS) du système
--              d'enrichissement du catalogue global
-- Defense in Depth : Layer 1 (App) + Layer 2 (Transaction) + Layer 3 (RLS)
-- Date: 2026-01-16
-- =====================================================

BEGIN;

-- =====================================================
-- VÉRIFICATION : RLS déjà activé sur global_products
-- =====================================================
-- ALTER TABLE global_products ENABLE ROW LEVEL SECURITY;
-- (déjà activé dans 002_rls_policies.sql)

-- =====================================================
-- POLICIES EXISTANTES : À conserver (déjà en place)
-- =====================================================
-- SELECT : true (tous les utilisateurs lisent les produits globaux)
-- INSERT : is_super_admin() (seuls super admins créent)
-- UPDATE : is_super_admin() (seuls super admins modifient)
-- DELETE : is_super_admin() (seuls super admins supprimient)

-- Les policies ci-dessous renforcent Layer 3 pour le système d'enrichissement

-- =====================================================
-- POLICY : Contrôle strict INSERT pour enrichissement
-- =====================================================
-- Vérifie que TOUTE insertion de global_product respecte is_super_admin()
DROP POLICY IF EXISTS "Super admins can create global products" ON global_products;

CREATE POLICY "Super admins can create global products - enrichment layer"
  ON global_products FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Layer 3a : Vérifier rôle super_admin
    EXISTS (
      SELECT 1 FROM bar_members
      WHERE user_id = auth_user_id()
      AND role = 'super_admin'
      AND is_active = true
    )
    -- Layer 3b : Champs requis pour enrichissement sont présents
    AND name IS NOT NULL
    AND category IS NOT NULL
    AND volume IS NOT NULL
    -- Layer 3c : Si c'est un enrichissement, source_bar_id doit être rempli
    -- (optionnel, juste un guide - admins peuvent créer globaux sans source)
  );

-- =====================================================
-- POLICY : Contrôle strict UPDATE pour enrichissement
-- =====================================================
DROP POLICY IF EXISTS "Super admins can update global products" ON global_products;

CREATE POLICY "Super admins can update global products - enrichment layer"
  ON global_products FOR UPDATE
  TO authenticated
  USING (
    -- Layer 3a : Seul super_admin peut modifier
    EXISTS (
      SELECT 1 FROM bar_members
      WHERE user_id = auth_user_id()
      AND role = 'super_admin'
      AND is_active = true
    )
  )
  WITH CHECK (
    -- Layer 3b : Maintenir cohérence données
    EXISTS (
      SELECT 1 FROM bar_members
      WHERE user_id = auth_user_id()
      AND role = 'super_admin'
      AND is_active = true
    )
  );

-- =====================================================
-- POLICY : Protection DELETE (soft delete via is_active)
-- =====================================================
DROP POLICY IF EXISTS "Super admins can delete global products" ON global_products;

CREATE POLICY "Super admins can delete global products - enrichment layer"
  ON global_products FOR DELETE
  TO authenticated
  USING (
    -- Layer 3 : Seul super_admin peut supprimer (soft delete)
    EXISTS (
      SELECT 1 FROM bar_members
      WHERE user_id = auth_user_id()
      AND role = 'super_admin'
      AND is_active = true
    )
  );

-- =====================================================
-- RLS pour audit_logs : Permettre inserts automatiques
-- =====================================================
-- audit_logs doit être accessible pour logs auto (non bloquant)
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Créer policy permissive pour inserts audit (non bloquant)
DROP POLICY IF EXISTS "System can create audit logs" ON audit_logs;

CREATE POLICY "System can create audit logs"
  ON audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- SELECT audit logs : super_admin only
DROP POLICY IF EXISTS "Super admins can view audit logs" ON audit_logs;

CREATE POLICY "Super admins can view audit logs"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM bar_members
      WHERE user_id = auth_user_id()
      AND role = 'super_admin'
      AND is_active = true
    )
  );

COMMIT;

-- =====================================================
-- Rapport d'exécution
-- =====================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Layer 3 (RLS) du système d''enrichissement installé:';
  RAISE NOTICE '- global_products : RLS policies renforcées';
  RAISE NOTICE '- INSERT : is_super_admin() + champs requis';
  RAISE NOTICE '- UPDATE : is_super_admin()';
  RAISE NOTICE '- DELETE (soft) : is_super_admin()';
  RAISE NOTICE '- audit_logs : RLS pour inserts auto non bloquants';
  RAISE NOTICE '';
  RAISE NOTICE 'Defense in Depth COMPLÈTE :';
  RAISE NOTICE '  Layer 1 (App) : catalogEnrichment.service.ts';
  RAISE NOTICE '  Layer 2 (Tx) : Transaction atomique (INSERT + UPDATE)';
  RAISE NOTICE '  Layer 3 (RLS) : PostgreSQL policies ✅ <-- NOUVEAU';
END $$;
