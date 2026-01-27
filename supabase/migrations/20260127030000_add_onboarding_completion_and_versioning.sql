-- Migration: Add onboarding completion tracking and training versioning system
-- Date: 2026-01-27
-- Purpose: Track user onboarding completion and training version progress

-- =====================================================
-- 1. Add columns to users table
-- =====================================================

-- Columns for tracking onboarding completion
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_completed_onboarding BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

-- Column for training versioning
ALTER TABLE users ADD COLUMN IF NOT EXISTS training_version_completed INTEGER DEFAULT 0;

-- Add comments for documentation
COMMENT ON COLUMN users.has_completed_onboarding IS 'Indicates if user has completed the onboarding/training flow';
COMMENT ON COLUMN users.onboarding_completed_at IS 'Timestamp when user completed onboarding';
COMMENT ON COLUMN users.training_version_completed IS 'Latest training version completed by user (0 = none)';

-- =====================================================
-- 2. Create training_versions table
-- =====================================================

CREATE TABLE IF NOT EXISTS training_versions (
  id SERIAL PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('promoteur', 'gerant', 'serveur')),
  version INTEGER NOT NULL,
  released_at TIMESTAMPTZ DEFAULT NOW(),
  changelog TEXT,
  UNIQUE(role, version)
);

-- Add comments
COMMENT ON TABLE training_versions IS 'Tracks training content versions for each role';
COMMENT ON COLUMN training_versions.role IS 'User role this training version applies to';
COMMENT ON COLUMN training_versions.version IS 'Version number (incremental)';
COMMENT ON COLUMN training_versions.changelog IS 'Description of changes in this version';

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_training_versions_role ON training_versions(role);

-- =====================================================
-- 3. Insert initial training versions
-- =====================================================

INSERT INTO training_versions (role, version, changelog) VALUES
  ('promoteur', 1, 'Formation initiale : Gestion de bar, rapports financiers, supervision d''équipe'),
  ('gerant', 1, 'Formation initiale : Validation des ventes, gestion d''équipe, rapports quotidiens'),
  ('serveur', 1, 'Formation initiale : Enregistrement des ventes, gestion des retours, interface utilisateur')
ON CONFLICT (role, version) DO NOTHING;

-- =====================================================
-- 4. Migrate existing users (legacy accounts)
-- =====================================================

-- Mark all users created before this migration as having completed onboarding
-- This prevents showing onboarding to existing users
UPDATE users 
SET 
  has_completed_onboarding = true,
  onboarding_completed_at = created_at,
  training_version_completed = 1  -- Consider them as having completed v1
WHERE created_at < '2026-01-27' AND has_completed_onboarding = false;

-- =====================================================
-- 5. Grant permissions
-- =====================================================

-- Allow authenticated users to read training versions
GRANT SELECT ON training_versions TO authenticated;
