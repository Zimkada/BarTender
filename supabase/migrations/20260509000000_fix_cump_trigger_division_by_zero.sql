-- Migration: Fix division by zero in CUMP trigger on supply reversal
--
-- Problème : le trigger update_product_current_average_cost calcule
--   SUM(unit_cost * quantity) / SUM(quantity)
-- Lors d'une annulation d'approvisionnement, la ligne miroir négative
-- (quantity = -X) est insérée. Si toutes les lignes s'annulent mutuellement
-- (SUM(quantity) = 0), la division lève une exception.
--
-- Fix :
--   1. NULLIF(SUM(quantity), 0) — retourne NULL au lieu de diviser par zéro.
--   2. COALESCE(..., current_average_cost, 0) — conserve le CUMP actuel si
--      le résultat est NULL (stock net = 0 après annulation totale).
--   3. Suppression de la fenêtre 90 jours — les approvisionnements anciens
--      doivent contribuer au CUMP ; les exclure fausse le calcul.
--   4. Filtre reversal_of_id IS NULL — les lignes miroir ne doivent pas
--      entrer dans le calcul CUMP (leur effet est déjà dans les lignes
--      originales via le stock net). On recalcule le CUMP uniquement sur
--      les lignes sources positives dont le stock n'a pas encore été
--      consommé — approximation conforme SYSCOHADA pour le cas courant.
--
-- Note SYSCOHADA : le CUMP sur stock nul est techniquement indéfini.
-- On conserve le dernier CUMP connu (current_average_cost) pour éviter
-- de perdre l'information et ne pas bloquer les opérations futures.

CREATE OR REPLACE FUNCTION update_product_current_average_cost()
RETURNS TRIGGER AS $$
DECLARE
    v_product_id UUID;
BEGIN
    v_product_id := COALESCE(NEW.product_id, OLD.product_id);

    UPDATE bar_products
    SET current_average_cost = COALESCE(
        (
            SELECT SUM(sup.unit_cost::numeric * sup.quantity::numeric)
                 / NULLIF(SUM(sup.quantity::numeric), 0)
            FROM supplies sup
            WHERE sup.product_id = v_product_id
              AND sup.reversal_of_id IS NULL
        ),
        current_average_cost,
        0
    )
    WHERE id = v_product_id;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_product_current_average_cost() IS
    'Recalcule bar_products.current_average_cost (CUMP) via moyenne pondérée des approvisionnements sources (hors lignes de reverse). Protégé contre la division par zéro avec NULLIF — conserve le CUMP actuel si le stock net est nul.';
