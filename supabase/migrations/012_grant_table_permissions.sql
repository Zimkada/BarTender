-- =====================================================
-- MIGRATION 012: Grant table-level permissions to authenticated role
-- Date: 20 Novembre 2025
-- =====================================================

-- Accorder au rôle 'authenticated' les permissions de base sur le schéma public
GRANT USAGE ON SCHEMA public TO authenticated;

-- Accorder les permissions sur la table 'users'
-- C'est la correction la plus probable pour l'erreur 403
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.users TO authenticated;

-- Accorder les permissions sur la table 'bar_members' (nécessaire pour la suite du login)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.bar_members TO authenticated;

-- Accorder les permissions sur la table 'bars'
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.bars TO authenticated;

-- NOTE: Vous devrez peut-être ajouter des permissions pour d'autres tables
-- si des erreurs 403 apparaissent sur celles-ci plus tard.

COMMENT ON TABLE public.users IS 'Grants basic R/W permissions to logged-in users. RLS policies will handle fine-grained access control.';
