-- =====================================================
-- MIGRATION 007: Performance indexes for production
-- Date: 19 Novembre 2025
-- =====================================================

-- Index sur username pour login rapide (si pas déjà créé)
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Index composite sur bar_members pour requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_bar_members_user_bar ON bar_members(user_id, bar_id) WHERE is_active = true;

-- Index sur bar_members.role pour les queries RLS
CREATE INDEX IF NOT EXISTS idx_bar_members_role ON bar_members(role) WHERE is_active = true;

-- Index sur last_login_at pour analytics
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login_at) WHERE is_active = true;

COMMENT ON INDEX idx_bar_members_user_bar IS 'Performance: login_user() et RLS queries';
