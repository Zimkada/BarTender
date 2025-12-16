-- Migration: Optimisation de la performance de la recherche utilisateur.
-- Date: 2025-12-15 19:00:00
-- Description: Active l'extension pg_trgm et crée un index GIN sur les colonnes de recherche de la table 'users'.

-- 1. Active l'extension pg_trgm (nécessaire pour les index GIN sur la similarité de texte)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Crée un index GIN pour accélérer les recherches ILIKE sur les colonnes 'name', 'email', 'username'.
-- L'opérateur gin_trgm_ops est utilisé pour les recherches basées sur les trigrammes.
CREATE INDEX IF NOT EXISTS users_search_gin_idx ON public.users USING gin (
    name gin_trgm_ops,
    email gin_trgm_ops,
    username gin_trgm_ops
);

COMMENT ON INDEX users_search_gin_idx IS 'Index GIN pour optimiser les recherches ILIKE sur les utilisateurs.';

-- Notifier Supabase de recharger le schéma pour PostgREST si nécessaire (souvent automatique après CREATE INDEX)
NOTIFY pgrst, 'reload schema';
