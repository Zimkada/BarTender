-- Migration : Réparation finale des produits corrompus (is_custom_product + global_product_id)
--
-- Contexte / cause racine :
--   Une version de catalogEnrichment.service.ts ANTÉRIEURE au commit f11797a liait un
--   produit custom au catalogue global en posant global_product_id SANS repasser
--   is_custom_product à false. Résultat : des bar_products dans l'état incohérent
--   is_custom_product = true ET global_product_id IS NOT NULL.
--
--   La contrainte chk_custom_product_consistency (migration 20260520000003) interdit cet état.
--   Tout UPDATE sur une ligne ainsi corrompue (ex : modifier le prix depuis l'inventaire)
--   est rejeté avec :
--     new row for relation "bar_products" violates check constraint "chk_custom_product_consistency"
--
--   Les migrations 20260520000001 / 000002 ne corrigeaient qu'une LISTE FIGÉE d'IDs connus
--   à l'époque. Des produits enrichis avant le fix mais hors de ces listes (ou enrichis
--   ensuite par un client encore sur l'ancienne version) restent corrompus.
--
-- Correction :
--   Un produit lié au catalogue global (global_product_id IS NOT NULL) ne peut pas être custom.
--   On force donc is_custom_product = false sur TOUTES les lignes restantes dans cet état.
--   Idempotent : ne touche que les lignes effectivement corrompues, y compris inactives
--   (la contrainte CHECK couvre toute la table).
--
--   Note : on ne touche PAS is_source_of_global. Cette colonne signifie « ce bar est à
--   l'origine de l'entrée au catalogue global » et ne doit être vraie que pour les produits
--   réellement enrichis depuis ce bar — l'imposer en masse serait une fausse information.
--
-- Le code applicatif actuel (post-f11797a) écrit déjà un état cohérent : cette migration
-- corrige uniquement les données héritées, aucun changement de code n'est requis.

BEGIN;

UPDATE bar_products
SET is_custom_product = false
WHERE is_custom_product = true
  AND global_product_id IS NOT NULL;

-- Vérification : plus aucune ligne ne doit violer l'invariant.
DO $$
DECLARE
  v_remaining INT;
BEGIN
  SELECT COUNT(*) INTO v_remaining
  FROM bar_products
  WHERE is_custom_product = true
    AND global_product_id IS NOT NULL;

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'Réparation incomplète : % ligne(s) encore corrompue(s)', v_remaining;
  END IF;

  RAISE NOTICE 'OK — toutes les lignes bar_products respectent chk_custom_product_consistency';
END $$;

COMMIT;
