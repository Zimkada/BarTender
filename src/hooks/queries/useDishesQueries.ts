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
  type DishComponentRow,
  type DishCostResult,
  type DishCostSummary,
  type DailyScopeTotals,
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
  /**
   * ⭐ Distincte de `recipe` : ce sont DEUX objets différents (ingrédients vs
   * lots prélevés). Une clé partagée les ferait s'invalider ensemble et
   * refetcherait la recette à chaque changement de composition.
   */
  components: (barId: string, dishId: string) =>
    [...dishKeys.all, 'components', barId, dishId] as const,
  cost: (barId: string, dishId: string) =>
    [...dishKeys.all, 'cost', barId, dishId] as const,
  /** Coûts de TOUS les plats — clé distincte du coût unitaire. */
  allCosts: (barId: string) => [...dishKeys.all, 'all-costs', barId] as const,
  /**
   * Ventilation Bar / Restau d'une journée.
   * ⚠️ La DATE fait partie de la clé : sans elle, changer de jour servirait
   * le cache de la veille.
   */
  scopeTotals: (barId: string, businessDate: string) =>
    [...dishKeys.all, 'scope-totals', barId, businessDate] as const,
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
 * Composition d'un plat — quels lots il prélève (§13.8).
 *
 * ⭐ Chargée À LA DEMANDE, comme la recette : la liste des plats n'en a pas
 * besoin, et la charger pour tous multiplierait les requêtes sans usage.
 */
export function useDishComponents(barId: string | undefined, dishId: string | undefined) {
  const { hasRestaurant } = useBarContext();

  return useQuery<DishComponentRow[]>({
    queryKey: dishKeys.components(barId ?? '', dishId ?? ''),
    queryFn: () => DishesService.getComponents(barId as string, dishId as string),
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
 * ⭐ Coûts et marges de TOUS les plats — UN appel pour la liste entière.
 *
 * C'est ce qui rend le livrable de la phase 2 réel : « le promoteur découvre la
 * marge réelle de ses plats ». Sans cette query, il faudrait ouvrir 15 recettes
 * une par une pour comparer — personne ne le ferait.
 *
 * ⚠️ `salesAndStock` (5 min) et NON `products` : les coûts dépendent des LOTS
 * en stock, qui se vident à chaque plat produit. Un cache de 30 min afficherait
 * des marges calculées sur des lots déjà consommés.
 *
 * ⭐ Remplace tout appel en boucle à `useDishCost` : 40 plats = 1 requête.
 */
export function useAllDishCosts(barId: string | undefined) {
  const { hasRestaurant } = useBarContext();

  return useQuery<DishCostSummary[]>({
    queryKey: dishKeys.allCosts(barId ?? ''),
    queryFn: () => DishesService.getAllDishCosts(barId as string),
    // ⭐ §3 — aucune requête sur un bar pur.
    enabled: !!barId && hasRestaurant,
    ...CACHE_STRATEGY.salesAndStock,
  });
}

/**
 * ⭐ Ventilation Bar / Restau du CA et des articles du jour (§9).
 *
 * ⭐ C'est LA « query agrégée supplémentaire » que le §9 autorise quand
 * `has_restaurant = true`. Elle remplace le chargement du détail de toutes les
 * ventes du jour : 4 nombres au lieu de 200 tickets.
 *
 * ⚠️ Appelée UNE fois par journée. Changer de portée ne déclenche AUCUNE
 * requête — les trois portées se servent du même résultat (§9).
 *
 * ⚠️ `salesAndStock` (5 min) : le CA du jour bouge à chaque vente. Un cache
 * long afficherait un montant déjà dépassé sur le Dashboard, qui est l'écran
 * consulté en continu pendant le service.
 */
export function useDailyScopeTotals(
  barId: string | undefined,
  businessDate: string | undefined
) {
  const { hasRestaurant } = useBarContext();

  return useQuery<DailyScopeTotals>({
    queryKey: dishKeys.scopeTotals(barId ?? '', businessDate ?? ''),
    queryFn: () => DishesService.getDailyScopeTotals(barId as string, businessDate as string),
    // ⭐ §3 — aucune requête sur un bar pur.
    // ⚠️ Garde sur `businessDate` aussi : le RPC la refuse si elle est nulle,
    // autant ne pas partir du tout.
    enabled: !!barId && !!businessDate && hasRestaurant,
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
