/**
 * useUnifiedDishes
 * PIVOT HOOK des plats (§13.15, architecture 3 couches).
 *
 * Orchestrateur : combine les queries et expose des données PRÊTES À AFFICHER.
 * Les composants consomment ce hook, jamais les queries directement.
 *
 * ⭐ COMPOSE `useUnifiedKitchen` au lieu de recharger les ingrédients.
 * Le formulaire de recette a besoin de la liste des ingrédients pour son
 * sélecteur — elle est DÉJÀ en cache via le pivot cuisine. Refaire la requête
 * ici doublerait l'egress d'un écran, sur un projet qui a mené 3 vagues
 * d'optimisation pour descendre à ~200 MB/j.
 *
 * ⭐ AUCUN COÛT N'EST CALCULÉ ICI (§4.1, §8).
 * Le coût matière vit sur le SERVEUR (`calculate_dish_cost`, simulation FEFO).
 * Le répliquer en TypeScript créerait deux implémentations de la même règle,
 * qui finiraient par diverger — or c'est l'ÉCART théorique/réel qui est « la
 * métrique la plus précieuse du module ». Un écart dû à la méthode de calcul
 * la rendrait ininterprétable.
 *
 * ⚠️ Le coût n'est donc PAS dans la liste : `useDishCost` est appelé à la
 * demande sur le plat sélectionné (écran d'édition). Afficher un coût par ligne
 * signifierait N requêtes pour N plats — une information que personne ne lit à
 * ce moment-là.
 *
 * ⭐ §3 est porté par les queries sous-jacentes (`enabled: hasRestaurant`).
 * Ce hook peut donc être monté sans condition : sur un bar pur, il retourne des
 * tableaux vides SANS émettre la moindre requête.
 */

import { useMemo, useCallback } from 'react';
import { useDishes } from '../queries/useDishesQueries';
import { useUnifiedKitchen } from './useUnifiedKitchen';
import type { DishRow } from '../../services/supabase/dishes.service';
import type { IngredientWithAlerts } from './useUnifiedKitchen';

/**
 * ⚠️ PAS de champ `hasRecipe` ni `recipeLineCount` sur les plats de la liste.
 *
 * Ils avaient été prévus puis RETIRÉS : les recettes sont chargées à la demande
 * (`useDishRecipe`, un plat à la fois), donc ces drapeaux auraient été codés en
 * dur à `false`/`0` — des champs MENSONGERS, du même genre que le `stock = 0`
 * éternel qui a fait écarter `bar_products.is_dish` (§4.5).
 *
 * Les charger pour les renseigner serait le N+1 qu'on évite : 40 plats,
 * 40 requêtes, pour un drapeau.
 *
 * → L'état de la recette n'est affiché que sur le plat OUVERT, à partir de la
 *   vraie recette. Mieux vaut ne rien afficher qu'un drapeau faux.
 */

export function useUnifiedDishes(barId: string | undefined) {
  const {
    data: dishes = [],
    isLoading: isLoadingDishes,
    refetch: refetchDishes,
  } = useDishes(barId);

  // ⭐ Ingrédients RÉUTILISÉS depuis le pivot cuisine — aucune requête de plus.
  const {
    ingredients,
    isLoading: isLoadingIngredients,
    refetch: refetchIngredients,
  } = useUnifiedKitchen(barId);

  /** Plats coupés par le cuisinier (rupture) — à remettre en service. */
  const unavailableDishes = useMemo(
    () => dishes.filter((d) => !d.is_available),
    [dishes]
  );

  /**
   * Plats-bases : ceux qui produisent un lot (riz cuit, poulet bouilli).
   * Utile au formulaire de recette pour les sous-recettes (§13.8, phase
   * ultérieure) et pour l'écran de production de lots.
   */
  const batchBaseDishes = useMemo(
    () => dishes.filter((d) => d.is_batch_base),
    [dishes]
  );

  /**
   * Index par id — O(1) au lieu d'un `find` par ligne rendue.
   * Même motif que `expiringLotsByIngredient` dans useUnifiedKitchen.
   */
  const dishesById = useMemo(() => {
    const map = new Map<string, DishRow>();
    for (const dish of dishes) {
      map.set(dish.id, dish);
    }
    return map;
  }, [dishes]);

  const getDishById = useCallback(
    (dishId: string) => dishesById.get(dishId),
    [dishesById]
  );

  /**
   * Ingrédients sélectionnables dans une recette.
   *
   * ⚠️ Aucun filtre sur `cost_mode` : les 4 modes sont légitimes dans une
   * recette (§16.3). Un `global` (sel) n'entre pas au coût du plat mais fait
   * bien partie de la recette — l'exclure ici la rendrait incomplète.
   */
  const availableIngredients = useMemo<IngredientWithAlerts[]>(
    () => ingredients,
    [ingredients]
  );

  const refetch = useCallback(() => {
    refetchDishes();
    refetchIngredients();
  }, [refetchDishes, refetchIngredients]);

  return {
    // Données
    dishes,
    availableIngredients,

    // Sous-ensembles prêts à afficher
    unavailableDishes,
    batchBaseDishes,

    // Helper O(1)
    getDishById,

    // État
    isLoading: isLoadingDishes || isLoadingIngredients,
    refetch,
  };
}
