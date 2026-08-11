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
  type IngredientSizeRow,
  type LotCountRow,
  type SizeReconciliationRow,
} from '../../services/supabase/ingredients.service';
import { useAuth } from '../../context/AuthContext';

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
  /** §19.6 — tailles déclarées d'un ingrédient (Grand / Moyen / Petit…). */
  sizes: (barId: string, ingredientId: string) =>
    [...ingredientKeys.all, 'sizes', barId, ingredientId] as const,
  /** §19.6 — comptage par taille d'un lot reçu. */
  lotCounts: (barId: string, lotId: string) =>
    [...ingredientKeys.all, 'lot-counts', barId, lotId] as const,
  /**
   * §19.6 — rapprochement reçus ↔ vendus sur une période.
   * ⚠️ Les DATES font partie de la clé : deux périodes sont deux résultats.
   */
  reconciliation: (barId: string, start: string, end: string) =>
    [...ingredientKeys.all, 'reconciliation', barId, start, end] as const,
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

// ═══════════════════════════════════════════════════════════════════════
// §19.6 — TAILLES ET RAPPROCHEMENT CARTON ↔ VENTES
// ═══════════════════════════════════════════════════════════════════════

/**
 * Tailles déclarées d'un ingrédient — §19.6.
 *
 * ⭐ Sur l'INGRÉDIENT et non sur le plat : un même carton alimente plusieurs
 * plats, et « Grand » est une caractéristique du poisson, pas d'une recette.
 *
 * ⚠️ `ingredientId` optionnel : sans lui, aucune requête ne part. C'est ce qui
 * permet de monter le hook dans un formulaire avant qu'un ingrédient ne soit
 * choisi.
 */
export function useIngredientSizes(barId: string | undefined, ingredientId: string | undefined) {
  const { hasRestaurant } = useBarContext();

  return useQuery<IngredientSizeRow[]>({
    queryKey: ingredientKeys.sizes(barId ?? '', ingredientId ?? ''),
    queryFn: () => IngredientsService.getSizes(barId as string, ingredientId as string),
    enabled: !!barId && !!ingredientId && hasRestaurant,
    // ⭐ Quasi-statique : les tailles d'un ingrédient ne changent presque
    // jamais, contrairement à son stock.
    ...CACHE_STRATEGY.products,
  });
}

/** Comptage par taille déjà saisi pour un lot — §19.6. */
export function useLotCounts(barId: string | undefined, lotId: string | undefined) {
  const { hasRestaurant } = useBarContext();

  return useQuery<LotCountRow[]>({
    queryKey: ingredientKeys.lotCounts(barId ?? '', lotId ?? ''),
    queryFn: () => IngredientsService.getLotCounts(barId as string, lotId as string),
    enabled: !!barId && !!lotId && hasRestaurant,
    ...CACHE_STRATEGY.salesAndStock,
  });
}

/**
 * Rapprochement reçus ↔ vendus par taille — §19.6.
 *
 * ⛔ GARDE `canViewKitchenCosts` : c'est un écran de CONTRÔLE, qui sert à
 * repérer un serveur facturant du grand pour du moyen servi. Le montrer à
 * celui qu'il surveille le viderait de son sens.
 *
 * ⚠️ `enabled` explicite en plus : cet écran n'est pas ouvert en permanence,
 * et la requête ne doit pas partir tant qu'il ne l'est pas.
 */
export function useSizeReconciliation(
  barId: string | undefined,
  start: string,
  end: string,
  enabled = true
) {
  const { hasRestaurant } = useBarContext();
  const { hasPermission } = useAuth();

  return useQuery<SizeReconciliationRow[]>({
    queryKey: ingredientKeys.reconciliation(barId ?? '', start, end),
    queryFn: () => IngredientsService.getSizeReconciliation(barId as string, start, end),
    enabled:
      !!barId && !!start && !!end && hasRestaurant &&
      hasPermission('canViewKitchenCosts') && enabled,
    ...CACHE_STRATEGY.salesAndStock,
  });
}
