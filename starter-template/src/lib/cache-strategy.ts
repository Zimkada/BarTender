/**
 * Stratégie de Cache — React Query
 *
 * Centralise les durées de vie du cache par type de donnée.
 * Utiliser ces constantes dans tous les useQuery() au lieu de valeurs hardcodées.
 *
 * Usage :
 *   const { data } = useQuery({
 *     queryKey: QUERY_KEYS.products.list(barId),
 *     queryFn: () => getProducts(barId),
 *     ...CACHE_STRATEGY.products,
 *   });
 */

const ONE_MINUTE = 60 * 1000;
const ONE_HOUR   = 60 * ONE_MINUTE;
const ONE_DAY    = 24 * ONE_HOUR;

export const CACHE_STRATEGY = {
  /** Données temps réel : ventes, stock. Invalidation explicite post-mutation requise. */
  realtime: {
    staleTime: 5 * ONE_MINUTE,
    gcTime: ONE_DAY,
  },

  /** Stats dashboard : léger délai acceptable (2 min). */
  stats: {
    staleTime: 2 * ONE_MINUTE,
    gcTime: ONE_DAY,
  },

  /** Catalogue produits : change rarement. */
  products: {
    staleTime: 30 * ONE_MINUTE,
    gcTime: ONE_DAY,
  },

  /** Données quasi-statiques : catégories, settings, rôles. */
  static: {
    staleTime: ONE_DAY,
    gcTime: 7 * ONE_DAY,
  },
} as const;

/**
 * Clés de cache structurées pour cibler les invalidations.
 *
 * Pattern hiérarchique : ['entity', 'scope', id]
 * Permet d'invalider tout un groupe : queryClient.invalidateQueries({ queryKey: ['products'] })
 * Ou une query spécifique : queryClient.invalidateQueries({ queryKey: QUERY_KEYS.products.list(barId) })
 *
 * ⚠️ À enrichir avec les entités de ton projet.
 */
export const QUERY_KEYS = {
  // Exemple : remplacer par les entités de ton domaine
  items: {
    all:    ['items']                                    as const,
    list:   (tenantId: string) => ['items', 'list', tenantId]   as const,
    detail: (id: string)       => ['items', 'detail', id]       as const,
  },
  users: {
    all:    ['users']                                    as const,
    list:   (tenantId: string) => ['users', 'list', tenantId]   as const,
    detail: (id: string)       => ['users', 'detail', id]       as const,
  },
} as const;
