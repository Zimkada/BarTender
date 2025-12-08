CREATE TABLE feature_flags (
  key TEXT PRIMARY KEY,
  enabled BOOLEAN DEFAULT false,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ -- Date d'expiration obligatoire du flag
);

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access for all authenticated users" ON feature_flags
FOR SELECT TO authenticated
USING (true);

-- Optionnel: Si vous voulez permettre à certains rôles d'écrire/modifier, ajouter d'autres policies.
-- Exemple pour les administrateurs:
-- CREATE POLICY "Allow admin to manage feature flags" ON feature_flags
-- FOR ALL TO service_role -- ou un rôle admin spécifique
-- USING (auth.role() = 'admin') WITH CHECK (auth.role() = 'admin');
