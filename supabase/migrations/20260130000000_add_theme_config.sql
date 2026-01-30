BEGIN;

-- Etape 1: Ajouter la colonne theme_config (Nullable pour compatibilité Prod immédiate)
-- Default est NULL, donc aucune donnée existante n'est touchée
ALTER TABLE bars 
ADD COLUMN theme_config JSONB DEFAULT NULL;

-- Etape 2: Index GIN pour performance (si on filtre par thème plus tard)
CREATE INDEX idx_bars_theme_config ON bars USING GIN (theme_config);

-- Etape 3: Contrainte de sécurité structurelle
-- On autorise NULL (pour les bars existants) 
-- MAIS SI theme_config est rempli, il DOIT être un objet valide et contenir 'preset'
ALTER TABLE bars 
ADD CONSTRAINT theme_config_schema CHECK (
  theme_config IS NULL OR (
    jsonb_typeof(theme_config) = 'object' AND
    theme_config ? 'preset'
  )
);

COMMIT;
