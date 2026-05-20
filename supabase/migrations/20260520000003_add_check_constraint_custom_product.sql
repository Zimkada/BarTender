-- Migration : Contrainte CHECK sur bar_products pour prévenir la corruption is_custom_product
--
-- Contexte :
--   Après correction des 51 produits corrompus (migrations 000001 + 000002),
--   on ajoute une contrainte DB pour garantir l'invariant à l'avenir :
--   un bar_product ne peut pas être simultanément custom ET lié au catalogue global.
--
--   Invariant : is_custom_product = true  → global_product_id IS NULL
--               is_custom_product = false → global_product_id peut être NULL ou NOT NULL
--
--   Note 1 : on utilise NOT VALID + VALIDATE séparés pour éviter un lock table complet
--   sur une table potentiellement volumineuse. NOT VALID crée la contrainte sans
--   scanner les lignes existantes ; VALIDATE la valide ensuite avec un lock plus léger.
--
--   Note 2 : avant VALIDATE, on corrige le dernier produit résiduel c0c0e507
--   (Bar Restau Le Marché — "Youki Cocktail (petit)", désactivé, doublon d'un produit actif).
--   Précédemment exclu des migrations 000001/000002 par prudence (doublon désactivé),
--   mais la contrainte CHECK couvre toute la table, y compris les lignes inactives.
--   Le produit reste désactivé après correction — aucun impact visible.

-- Étape 1 : Corriger le dernier produit résiduel
UPDATE bar_products
SET is_custom_product = false
WHERE id = 'c0c0e507-038f-4d01-8a18-787ff361a89f'
  AND is_custom_product = true
  AND global_product_id IS NOT NULL;

-- Étape 2 : Créer la contrainte sans valider les lignes existantes (pas de lock table)
ALTER TABLE bar_products
  ADD CONSTRAINT chk_custom_product_consistency
  CHECK (
    NOT (is_custom_product = true AND global_product_id IS NOT NULL)
  )
  NOT VALID;

-- Étape 3 : Valider sur les données existantes (ShareLock, pas ExclusiveLock)
-- Si des données corrompues subsistent malgré tout, cette ligne échoue avec un message explicite.
ALTER TABLE bar_products
  VALIDATE CONSTRAINT chk_custom_product_consistency;
