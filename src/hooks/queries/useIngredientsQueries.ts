/**
 * useIngredientsQueries
 * Couche QUERIES du module cuisine — fetching pur (§13.15, architecture 3 couches).
 *
 * ⭐⭐ INVARIANCE DES BARS PURS (§3) — LA CONTRAINTE QUI DOMINE CE FICHIER
 *
 * Chaque query porte `enabled: !!barId && hasRestaurant`. Ce n'est pas une
 * optimisation : c'est l'exigence de plus haut niveau du chantier.
 *
 * Le §3 identifie le niveau RÉSEAU comme « le plus insidieux et le plus coûteux » :
 * trois vagues d'optimisation ont ramené l'egress à ~200 MB/j, et une requête
 * cuisine partant sur TOUS les bars en annulerait une partie « sans que personne
 * ne le remarque avant la facture Supabase ».
 *
 * ⛔ Toute nouvelle query de ce fichier DOIT porter cette garde. Un `enabled`
 * oublié ne produit aucune erreur, aucun test rouge, aucun symptôme visible —
 * seulement de l'egress sur des bars qui n'ont pas de cuisine.
 * Le test `ingredientsInvariance.test.ts` existe précisément pour ça.
 */

import { useQuery } from '@tanstack/react-query';
import { useBarContext } from '../../context/BarContext';
import { CACHE_STRATEGY } from '../../lib/cache-strategy';
import {
  IngredientsService,
  type IngredientRow,
  type IngredientLotRow,
  type StockConsistencyViolation,
} from '../../services/supabase/ingredients.service';

// ===== Query Keys =====
// Hiérarchiques, pour permettre une invalidation ciblée ou large (§13.15).
export const ingredientKeys = {
  all: ['ingredients'] as const,
  list: (barId: string) => [...ingredientKeys.all, 'list', barId] as const,
  lots: (barId: string, ingredientId: string) =>
    [...ingredientKeys.all, 'lots', barId, ingredientId] as const,
  expiring: (barId: string, withinDays: number) =>
    [...ingredientKeys.all, 'expiring', barId, withinDays] as const,
  consistency: (barId: string) => [...ingredientKeys.all, 'consistency', barId] as const,
};

/**
 * Référentiel des ingrédients actifs du bar courant.
 *
 * ⚠️ Quasi-statique : `CACHE_STRATEGY.products` (30 min). Le référentiel change
 * rarement — ce sont les LOTS qui bougent, pas la liste des ingrédients.
 */
export function useIngredients(barId: string | undefined, includeRetired = false) {
  const { hasRestaurant } = useBarContext();

  return useQuery<IngredientRow[]>({
    // ⚠️ `includeRetired` DANS LA CLÉ : deux listes distinctes, deux caches.
    queryKey: [...ingredientKeys.list(barId ?? ''), includeRetired],
    queryFn: () => IngredientsService.getIngredients(barId as string, includeRetired),
    // ⭐ §3 — aucune requête sur un bar pur.
    enabled: !!barId && hasRestaurant,
    ...CACHE_STRATEGY.products,
  });
}

/**
 * Lots consommables d'un ingrédient, dans l'ordre FEFO.
 *
 * ⚠️ Temps réel (`salesAndStock`, 5 min) : les lots se vident à chaque plat
 * produit. Un cache long afficherait un stock déjà consommé.
 */
export function useIngredientLots(barId: string | undefined, ingredientId: string | undefined) {
  const { hasRestaurant } = useBarContext();

  return useQuery<IngredientLotRow[]>({
    queryKey: ingredientKeys.lots(barId ?? '', ingredientId ?? ''),
    queryFn: () => IngredientsService.getLotsFefo(barId as string, ingredientId as string),
    // ⭐ §3 + garde sur ingredientId : pas de requête sans cible.
    enabled: !!barId && !!ingredientId && hasRestaurant,
    ...CACHE_STRATEGY.salesAndStock,
  });
}

/**
 * Lots arrivant à expiration — alimente l'alerte de péremption (§8, 5e métrique).
 *
 * ⭐ C'est cette query qui rend actionnable « vous perdez 8 % de vos tomates » :
 * elle permet d'AGIR AVANT la perte, pas de la constater après.
 */
export function useExpiringLots(barId: string | undefined, withinDays = 3) {
  const { hasRestaurant } = useBarContext();

  return useQuery<IngredientLotRow[]>({
    queryKey: ingredientKeys.expiring(barId ?? '', withinDays),
    queryFn: () => IngredientsService.getExpiringLots(barId as string, withinDays),
    enabled: !!barId && hasRestaurant,
    ...CACHE_STRATEGY.salesAndStock,
  });
}

/**
 * Divergences du cache `current_stock` (§13.11).
 *
 * ⚠️ Outil de DIAGNOSTIC, pas d'affichage courant : `enabled` doit rester
 * explicitement demandé par l'appelant. Une vue d'audit qui tourne en
 * permanence sur chaque écran serait de l'egress pur — elle ne renvoie
 * normalement RIEN.
 *
 * ⭐ Toute ligne retournée est une anomalie : le cache diverge de la source de
 * vérité. La leçon du CUMP (vague 4c) est qu'un écart silencieux se découvre
 * des mois plus tard, sur des données déjà corrompues.
 */
export function useStockConsistencyCheck(barId: string | undefined, enabled = false) {
  const { hasRestaurant } = useBarContext();

  return useQuery<StockConsistencyViolation[]>({
    queryKey: ingredientKeys.consistency(barId ?? ''),
    queryFn: () => IngredientsService.getStockConsistencyViolations(barId as string),
    // ⭐ Triple garde : §3, cible, ET demande explicite de l'appelant.
    enabled: !!barId && hasRestaurant && enabled,
    ...CACHE_STRATEGY.salesAndStock,
  });
}
