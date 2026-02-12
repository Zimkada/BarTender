-- =====================================================
-- MIGRATION: Allow Servers to Create Returns & Track Validation
-- Date: 2026-02-10
-- =====================================================

BEGIN;

-- 1. Ajouter les colonnes de traçabilité à la table returns
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'returns' AND column_name = 'validated_by') THEN
        ALTER TABLE returns ADD COLUMN validated_by UUID REFERENCES users(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'returns' AND column_name = 'rejected_by') THEN
        ALTER TABLE returns ADD COLUMN rejected_by UUID REFERENCES users(id);
    END IF;
END $$;

-- 2. Mettre à jour les politiques RLS sur la table returns

-- Supprimer les anciennes politiques pour les recréer proprement
DROP POLICY IF EXISTS "Managers can create returns" ON returns;
DROP POLICY IF EXISTS "Managers can update returns" ON returns;

-- Nouvelle politique d'insertion : Serveurs, Gérants, Promoteurs et Super Admins
CREATE POLICY "Bar members can create returns"
  ON returns FOR INSERT
  WITH CHECK (is_bar_member(bar_id));

-- Nouvelle politique de mise à jour : Seuls Gérants, Promoteurs et Super Admins
-- Ils peuvent approuver, rejeter ou remettre en stock
CREATE POLICY "Managers can update returns"
  ON returns FOR UPDATE
  USING (
    get_user_role(bar_id) IN ('promoteur', 'gerant') OR
    is_super_admin()
  );

COMMIT;
