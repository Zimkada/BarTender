-- Migration: Ajouter items_count sur sales (colonne normale + trigger)
-- Objectif: pré-calculer la somme des quantities pour éviter de parser
-- le JSONB items[] côté client dans les vues liste.
--
-- PostgreSQL n'accepte pas les sous-requêtes / SRF dans GENERATED ALWAYS AS,
-- donc on utilise un trigger BEFORE INSERT OR UPDATE pour maintenir la valeur.

-- 1. Ajouter la colonne
ALTER TABLE sales ADD COLUMN IF NOT EXISTS items_count integer NOT NULL DEFAULT 0;

-- 2. Fonction de calcul
CREATE OR REPLACE FUNCTION compute_sale_items_count()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.items_count := COALESCE(
    (
      SELECT SUM((item->>'quantity')::integer)
      FROM jsonb_array_elements(NEW.items) AS item
      WHERE (item->>'quantity') IS NOT NULL
    ),
    0
  );
  RETURN NEW;
END;
$$;

-- 3. Trigger BEFORE INSERT OR UPDATE sur items
CREATE TRIGGER trg_compute_items_count
  BEFORE INSERT OR UPDATE OF items ON sales
  FOR EACH ROW
  EXECUTE FUNCTION compute_sale_items_count();

-- 4. Backfill les ventes existantes (UPDATE déclenche le trigger)
UPDATE sales SET items_count = COALESCE(
  (
    SELECT SUM((item->>'quantity')::integer)
    FROM jsonb_array_elements(items) AS item
    WHERE (item->>'quantity') IS NOT NULL
  ),
  0
)
WHERE items_count = 0 AND items IS NOT NULL AND items != '[]'::jsonb;

COMMENT ON COLUMN sales.items_count IS
  'Somme des quantities de tous les SaleItem — maintenu par trigger trg_compute_items_count.';
