-- Migration: Fix materialized_view_refresh_log RLS policies + constraint
-- Description: Fix CHECK constraint and add INSERT/UPDATE policies
-- Date: 2025-12-27

-- =====================================================
-- FIX 1: NETTOYER TABLE ET RECRÉER CONTRAINTE
-- =====================================================

-- Disable RLS temporarily to clean table
ALTER TABLE materialized_view_refresh_log DISABLE ROW LEVEL SECURITY;

-- Delete all existing rows (clean slate)
TRUNCATE TABLE materialized_view_refresh_log;

-- Drop existing constraint
ALTER TABLE materialized_view_refresh_log
DROP CONSTRAINT IF EXISTS materialized_view_refresh_log_status_check;

-- Recreate constraint with trimmed values
ALTER TABLE materialized_view_refresh_log
ADD CONSTRAINT materialized_view_refresh_log_status_check
CHECK (TRIM(status) IN ('running', 'success', 'failed', 'timeout'));

-- Re-enable RLS
ALTER TABLE materialized_view_refresh_log ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- FIX 2: AJOUTER POLICIES INSERT/UPDATE POUR FONCTIONS
-- =====================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow system functions to insert refresh logs" ON materialized_view_refresh_log;
DROP POLICY IF EXISTS "Allow system functions to update refresh logs" ON materialized_view_refresh_log;

-- Policy pour permettre aux fonctions SECURITY DEFINER d'insérer
CREATE POLICY "Allow system functions to insert refresh logs"
  ON materialized_view_refresh_log FOR INSERT
  WITH CHECK (true);

-- Policy pour permettre aux fonctions SECURITY DEFINER de mettre à jour
CREATE POLICY "Allow system functions to update refresh logs"
  ON materialized_view_refresh_log FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Supprimer les logs avec statuts invalides (si existants)
DELETE FROM materialized_view_refresh_log
WHERE status NOT IN ('running', 'success', 'failed', 'timeout');

-- Commentaire
COMMENT ON TABLE materialized_view_refresh_log IS 'Historique refresh materialized views - Status: running, success, failed, timeout. INSERT/UPDATE via fonctions SECURITY DEFINER uniquement';
