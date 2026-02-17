/**
 * Stratégie de Cache Granulaire (Phase 3)
 * Définit les durées de vie du cache pour chaque type de donnée.
 */

const ONE_MINUTE = 60 * 1000;
const ONE_HOUR = 60 * ONE_MINUTE;
const ONE_DAY = 24 * ONE_HOUR;

export const CACHE_STRATEGY = {
    // Temps réel : Invalidation immédiate post-mutation requise
    // StaleTime de 5min pour éviter le sur-fetching lors de la navigation rapide,
    // mais la fraîcheur est garantie par l'invalidation explicite dans les mutations.
    salesAndStock: {
        staleTime: 5 * ONE_MINUTE,
        gcTime: 24 * ONE_HOUR, // 24h pour support offline
    },

    // Court terme : Stats journalières, Dashboard
    // Acceptable d'avoir 2 min de délai sur un dashboard de stats
    dailyStats: {
        staleTime: 2 * ONE_MINUTE,
        gcTime: 24 * ONE_HOUR,
    },

    // Moyen terme : Produits & Catalogue
    // Les définitions de produits changent rarement
    // Note: Le stock (quantité) doit être géré via salesAndStock ou invalidation
    products: {
        staleTime: 30 * ONE_MINUTE,
        gcTime: 24 * ONE_HOUR,
    },

    // Long terme : Données quasi-statiques
    categories: {
        staleTime: 24 * ONE_HOUR,
        gcTime: 7 * ONE_DAY, // 1 semaine
    },
    promotionsAndCategories: {
        staleTime: 1 * ONE_HOUR,
        gcTime: 24 * ONE_HOUR,
    },
    settings: {
        staleTime: 24 * ONE_HOUR,
        gcTime: 7 * ONE_DAY,
    },
} as const;

/**
 * Helper pour générer les clés de requête de manière cohérente
 */
export const QUERY_KEYS = {
    sales: {
        all: ['sales'] as const,
        list: (barId: string) => ['sales', 'list', barId] as const,
        stats: (barId: string) => ['sales', 'stats', barId] as const,
    },
    products: {
        all: ['products'] as const,
        list: (barId: string) => ['products', 'list', barId] as const,
    },
    bars: {
        all: ['bars'] as const,
        list: () => ['bars', 'list'] as const,
        detail: (barId: string) => ['bars', 'detail', barId] as const,
    },
};
