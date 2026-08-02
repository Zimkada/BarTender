/**
 * useUnifiedKitchen
 * PIVOT HOOK du module cuisine (§13.15, architecture 3 couches).
 *
 * Orchestrateur : combine les queries, expose des données PRÊTES À AFFICHER.
 * Les composants consomment ce hook, jamais les queries directement.
 *
 * ⚠️ Pas d'offline queue ici, contrairement aux pivots de vente (§13.5) : les
 * opérations de stock cuisine exigent le réseau. Ce pivot n'a donc pas de
 * couche « optimiste » à fusionner — il agrège du serveur, un point c'est tout.
 *
 * ⭐ §3 est porté par les queries sous-jacentes (`enabled: hasRestaurant`).
 * Ce hook peut donc être monté sans condition : sur un bar pur, il retourne
 * des tableaux vides SANS émettre la moindre requête.
 */

import { useMemo, useCallback } from 'react';
import {
  useIngredients,
  useExpiringLots,
} from '../queries/useIngredientsQueries';
import type { IngredientRow, IngredientLotRow } from '../../services/supabase/ingredients.service';

/** Ingrédient enrichi des informations d'alerte, calculées côté client. */
export interface IngredientWithAlerts extends IngredientRow {
  /** Stock sous le seuil configuré — réapprovisionnement à prévoir. */
  isLowStock: boolean;
  /**
   * ⚠️ Stock NÉGATIF = des dettes non soldées (§13.2). Ce n'est pas une erreur
   * d'affichage : on a consommé sans stock disponible. L'écart doit rester
   * VISIBLE — c'est tout l'objet de la table des dettes.
   */
  hasDebt: boolean;
  /** Nombre de lots arrivant à expiration pour cet ingrédient. */
  expiringLotsCount: number;
}

export function useUnifiedKitchen(barId: string | undefined, expiringWithinDays = 3) {
  const {
    data: ingredients = [],
    isLoading: isLoadingIngredients,
    refetch: refetchIngredients,
  } = useIngredients(barId);

  const {
    data: expiringLots = [],
    isLoading: isLoadingExpiring,
    refetch: refetchExpiring,
  } = useExpiringLots(barId, expiringWithinDays);

  /**
   * Index lots-par-ingrédient — O(1) au lieu d'un `filter` par ligne rendue.
   * Même motif que `returnsBySaleMap` dans useUnifiedReturns.
   */
  const expiringLotsByIngredient = useMemo(() => {
    const map = new Map<string, IngredientLotRow[]>();
    for (const lot of expiringLots) {
      const existing = map.get(lot.ingredient_id);
      if (existing) {
        existing.push(lot);
      } else {
        map.set(lot.ingredient_id, [lot]);
      }
    }
    return map;
  }, [expiringLots]);

  /** Ingrédients enrichis des drapeaux d'alerte. */
  const ingredientsWithAlerts = useMemo<IngredientWithAlerts[]>(() => {
    return ingredients.map((ingredient) => ({
      ...ingredient,
      // ⚠️ `> 0` sur le seuil : un `min_stock_alert` à 0 ou nul signifie
      // « pas d'alerte », pas « alerte permanente ».
      isLowStock:
        ingredient.min_stock_alert != null &&
        ingredient.min_stock_alert > 0 &&
        ingredient.current_stock <= ingredient.min_stock_alert,
      hasDebt: ingredient.current_stock < 0,
      expiringLotsCount: expiringLotsByIngredient.get(ingredient.id)?.length ?? 0,
    }));
  }, [ingredients, expiringLotsByIngredient]);

  /**
   * ⭐ Valeur du stock à risque de péremption.
   *
   * C'est le chiffre qui rend §8 actionnable : « vous avez 12 400 F de matière
   * qui périme dans 3 jours ». Une LISTE de lots n'incite pas à agir, un
   * MONTANT si — et il permet d'AGIR AVANT la perte, pas de la constater après.
   */
  const expiringValue = useMemo(() => {
    return expiringLots.reduce(
      (total, lot) => total + lot.remaining_qty * lot.unit_cost,
      0
    );
  }, [expiringLots]);

  /** Ingrédients à réapprovisionner. */
  const lowStockIngredients = useMemo(
    () => ingredientsWithAlerts.filter((i) => i.isLowStock),
    [ingredientsWithAlerts]
  );

  /**
   * Ingrédients en dette (stock négatif).
   * ⚠️ À traiter comme une ANOMALIE À RÉGULARISER, pas comme un simple manque :
   * la matière a déjà été consommée, seul l'approvisionnement reste à faire.
   */
  const ingredientsInDebt = useMemo(
    () => ingredientsWithAlerts.filter((i) => i.hasDebt),
    [ingredientsWithAlerts]
  );

  const getIngredientById = useCallback(
    (ingredientId: string) => ingredientsWithAlerts.find((i) => i.id === ingredientId),
    [ingredientsWithAlerts]
  );

  const getExpiringLotsFor = useCallback(
    (ingredientId: string) => expiringLotsByIngredient.get(ingredientId) ?? [],
    [expiringLotsByIngredient]
  );

  const refetch = useCallback(() => {
    refetchIngredients();
    refetchExpiring();
  }, [refetchIngredients, refetchExpiring]);

  return {
    // Données
    ingredients: ingredientsWithAlerts,
    expiringLots,

    // Indicateurs prêts à afficher
    expiringValue,
    lowStockIngredients,
    ingredientsInDebt,

    // Helpers O(1)
    getIngredientById,
    getExpiringLotsFor,

    // État
    isLoading: isLoadingIngredients || isLoadingExpiring,
    refetch,
  };
}
