import { useQuery } from '@tanstack/react-query';
import { AnalyticsService, TopProduct } from '../../services/supabase/analytics.service';

// Clés de requête pour l'invalidation et le caching
// Clés de requête pour l'invalidation et le caching
export const topProductsKeys = {
    all: (barId: string) => ['topProducts', barId] as const,
    lists: (barId: string) => [...topProductsKeys.all(barId), 'lists'] as const,
    list: (barId: string, startDate?: Date | string, endDate?: Date | string, limit?: number, sortBy?: string) =>
        [...topProductsKeys.lists(barId), { startDate, endDate, limit, sortBy }] as const,
};

interface UseTopProductsOptions {
    barId: string;
    startDate?: Date | string;
    endDate?: Date | string;
    limit?: number;
    sortBy?: 'quantity' | 'revenue';
    serverId?: string; // Optional: filter by server for server accounts
    enabled?: boolean;
}

/**
 * Hook centralisé pour récupérer les "Top Produits"
 * Utilise TanStack Query pour le caching, le refetching automatique et la performance.
 * La logique de regroupement par `product_id` doit être gérée côté serveur dans la fonction RPC.
 */
export const useTopProducts = ({
    barId,
    startDate,
    endDate,
    limit = 10,
    sortBy = 'quantity',
    serverId,
    enabled = true,
}: UseTopProductsOptions) => {
    return useQuery<TopProduct[], Error>({
        queryKey: topProductsKeys.list(barId, startDate, endDate, limit, sortBy),
        queryFn: async () => {
            if (!barId || !startDate || !endDate) {
                return [];
            }
            // L'appel au service SQL est la seule source de vérité.
            // Le service gère automatiquement le filtrage par serverId si fourni.
            const products = await AnalyticsService.getTopProducts(
                barId,
                startDate,
                endDate,
                limit,
                sortBy,
                serverId
            );
            return products;
        },
        enabled: enabled && !!barId && !!startDate && !!endDate,
        staleTime: 5 * 60 * 1000, // 5 minutes de cache
        placeholderData: [], // Retourne un tableau vide pendant le chargement initial
    });
};
