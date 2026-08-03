/**
 * useDishesQueries
 * Couche QUERIES des plats — fetching pur (§13.15, architecture 3 couches).
 *
 * ⭐⭐ INVARIANCE DES BARS PURS (§3) — LA CONTRAINTE QUI DOMINE CE FICHIER
 *
 * Chaque query porte `enabled: !!barId && hasRestaurant`. Ce n'est pas une
 * optimisation : c'est l'exigence de plus haut niveau du chantier.
 *
 * Le §3 identifie le niveau RÉSEAU comme « le plus insidieux et le plus
 * coûteux » : trois vagues d'optimisation ont ramené l'egress à ~200 MB/j, et
 * une requête plats partant sur TOUS les bars en annulerait une partie « sans
 * que personne ne le remarque avant la facture Supabase ».
 *
 * ⛔ Toute nouvelle query de ce fichier DOIT porter cette garde. Un `enabled`
 * oublié ne produit aucune erreur, aucun test rouge, aucun symptôme visible.
 */

import { useQuery } from '@tanstack/react-query';
import { useBarContext } from '../../context/BarContext';
import { CACHE_STRATEGY } from '../../lib/cache-strategy';
import {
  DishesService,
  type DishRow,
  type DishIngredientRow,
  type DishCostResult,
} from '../../services/supabase/dishes.service';
import { CategoriesService } from '../../services/supabase/categories.service';
import type { Database } from '../../lib/database.types';

type BarCategoryRow = Database['public']['Tables']['bar_categories']['Row'];

// ===== Query Keys =====
// Hiérarchiques, pour permettre une invalidation ciblée ou large (§13.15).
export const dishKeys = {
  all: ['dishes'] as const,
  list: (barId: string) => [...dishKeys.all, 'list', barId] as const,
  recipe: (barId: string, dishId: string) =>
    [...dishKeys.all, 'recipe', barId, dishId] as const,
  cost: (barId: string, dishId: string) =>
    [...dishKeys.all, 'cost', barId, dishId] as const,
  /**
   * ⚠️ Sous `dishes` et NON sous `stockKeys.categories` : les deux listes
   * doivent s'invalider INDÉPENDAMMENT. Créer une catégorie de plats ne doit
   * pas refetcher le catalogue de boissons — et une clé partagée l'imposerait.
   */
  categories: (barId: string) => [...dishKeys.all, 'categories', barId] as const,
};

/**
 * Plats actifs du bar courant.
 *
 * ⚠️ Quasi-statique : `CACHE_STRATEGY.products` (30 min). Un menu change
 * rarement dans une journée — ce sont les prix et la disponibilité qui bougent,
 * et une mutation invalide explicitement le cache.
 */
export function useDishes(barId: string | undefined) {
  const { hasRestaurant } = useBarContext();

  return useQuery<DishRow[]>({
    queryKey: dishKeys.list(barId ?? ''),
    queryFn: () => DishesService.getDishes(barId as string),
    // ⭐ §3 — aucune requête sur un bar pur.
    enabled: !!barId && hasRestaurant,
    ...CACHE_STRATEGY.products,
  });
}

/**
 * Recette d'un plat — chargée à la DEMANDE, quand un plat est sélectionné.
 *
 * ⚠️ Volontairement NON préchargée pour tous les plats : 40 plats
 * signifieraient 40 requêtes (N+1). Le formulaire d'édition n'ouvre qu'une
 * recette à la fois.
 */
export function useDishRecipe(barId: string | undefined, dishId: string | undefined) {
  const { hasRestaurant } = useBarContext();

  return useQuery<DishIngredientRow[]>({
    queryKey: dishKeys.recipe(barId ?? '', dishId ?? ''),
    queryFn: () => DishesService.getDishRecipe(barId as string, dishId as string),
    // ⭐ §3 + garde sur dishId : pas de requête sans cible.
    enabled: !!barId && !!dishId && hasRestaurant,
    ...CACHE_STRATEGY.products,
  });
}

/**
 * ⭐ Coût matière d'un plat — À LA DEMANDE, jamais en liste.
 *
 * ⛔ NE JAMAIS appeler ce hook dans une boucle de rendu de liste : chaque appel
 * est une requête serveur (N+1). Il est réservé à l'écran d'ÉDITION, où
 * l'utilisateur regarde UN plat.
 *
 * ⚠️ `staleTime` court (`salesAndStock`, 5 min) et NON `products` : le coût
 * dépend des LOTS en stock, qui se vident à chaque plat produit. Un cache de
 * 30 min afficherait une marge calculée sur des lots déjà consommés.
 *
 * ⭐ Le calcul vit SUR LE SERVEUR (simulation FEFO). Ne jamais le répliquer
 * côté client : deux implémentations de la même règle divergeraient, et c'est
 * l'ÉCART théorique/réel qui est la métrique clé du module (§8).
 */
export function useDishCost(barId: string | undefined, dishId: string | undefined) {
  const { hasRestaurant } = useBarContext();

  return useQuery<DishCostResult>({
    queryKey: dishKeys.cost(barId ?? '', dishId ?? ''),
    queryFn: () => DishesService.getDishCost(barId as string, dishId as string),
    enabled: !!barId && !!dishId && hasRestaurant,
    ...CACHE_STRATEGY.salesAndStock,
  });
}

/**
 * ⭐ Catégories de PLATS (§13.10) — `type = 'dish'`.
 *
 * ⚠️ Query SÉPARÉE de `useCategories` (boissons), qui filtre désormais
 * `type = 'product'`. Le sélecteur « Tout / Boissons / Plats » consomme les
 * DEUX listes, déjà en cache : changer de portée ne déclenche AUCUNE requête,
 * conformément au §9 (« zéro refetch au changement de portée »).
 *
 * ⚠️ `CACHE_STRATEGY.categories` (24 h) : quasi-statique, comme son équivalent
 * boissons. Une création de catégorie invalide explicitement le cache.
 */
export function useDishCategories(barId: string | undefined) {
  const { hasRestaurant } = useBarContext();

  return useQuery<BarCategoryRow[]>({
    queryKey: dishKeys.categories(barId ?? ''),
    queryFn: () => CategoriesService.getDishCategories(barId as string),
    // ⭐ §3 — aucune requête sur un bar pur.
    enabled: !!barId && hasRestaurant,
    ...CACHE_STRATEGY.categories,
  });
}
