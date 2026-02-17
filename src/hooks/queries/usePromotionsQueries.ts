import { useQuery } from '@tanstack/react-query';
import { PromotionsService } from '../../services/supabase/promotions.service';
import type { Promotion } from '../../types';
import { CACHE_STRATEGY } from '../../lib/cache-strategy';
import { FEATURES } from '../../config/features';
import { useSmartSync } from '../useSmartSync';

/**
 * Query keys for promotions
 * Follows the pattern from useSalesQueries.ts
 */
export const promotionsKeys = {
    all: ['promotions'] as const,
    list: (barId: string) => [...promotionsKeys.all, 'list', barId] as const,
    active: (barId: string) => [...promotionsKeys.all, 'active', barId] as const,
    detail: (id: string) => [...promotionsKeys.all, 'detail', id] as const,
};

/**
 * Hook to fetch active promotions with React Query + Realtime sync
 * 
 * ✅ Features:
 * - Automatic cache management
 * - Real-time synchronization via useSmartSync
 * - Fallback to polling if Realtime fails
 * - Offline support with stale data
 * 
 * @example
 * ```typescript
 * const { data: promotions, isLoading, error } = useActivePromotions(barId);
 * ```
 */
export const useActivePromotions = (barId: string | undefined) => {
    const isEnabled = !!barId && FEATURES.PROMOTIONS_ENABLED;

    // 🚀 Real-time sync for promotions (INSERT/UPDATE/DELETE)
    const smartSync = useSmartSync({
        table: 'promotions',
        event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
        barId: barId || undefined,
        enabled: isEnabled,
        staleTime: CACHE_STRATEGY.promotionsAndCategories.staleTime,
        refetchInterval: 30000, // 30 seconds fallback polling
        queryKeysToInvalidate: [
            promotionsKeys.active(barId || ''),
            promotionsKeys.list(barId || ''),
        ]
    });

    return useQuery({
        queryKey: promotionsKeys.active(barId || ''),
        networkMode: 'always', // 🛡️ Allow cache access even offline
        queryFn: async (): Promise<Promotion[]> => {
            if (!barId) return [];

            const promotions = await PromotionsService.getActivePromotions(barId);

            if (FEATURES.PROMOTIONS_DEBUG_LOGGING) {
                console.log('[useActivePromotions] Loaded promotions:', promotions.length);
            }

            return promotions;
        },
        enabled: isEnabled,
        staleTime: CACHE_STRATEGY.promotionsAndCategories.staleTime,
        gcTime: CACHE_STRATEGY.promotionsAndCategories.gcTime,
        refetchInterval: smartSync.isSynced ? false : 30000, // 🚀 Hybrid: Realtime or 30s polling
        placeholderData: (previousData: Promotion[] | undefined) => previousData,
    });
};

/**
 * Hook to fetch all promotions (not just active)
 * Useful for management pages
 */
export const useAllPromotions = (barId: string | undefined) => {
    const isEnabled = !!barId && FEATURES.PROMOTIONS_ENABLED;

    // Share the same smartSync as active promotions
    useSmartSync({
        table: 'promotions',
        event: '*',
        barId: barId || undefined,
        enabled: isEnabled,
        staleTime: CACHE_STRATEGY.promotionsAndCategories.staleTime,
        refetchInterval: 30000,
        queryKeysToInvalidate: [
            promotionsKeys.list(barId || ''),
            promotionsKeys.active(barId || ''),
        ]
    });

    return useQuery({
        queryKey: promotionsKeys.list(barId || ''),
        networkMode: 'always',
        queryFn: async (): Promise<Promotion[]> => {
            if (!barId) return [];

            const promotions = await PromotionsService.getAllPromotions(barId);

            if (FEATURES.PROMOTIONS_DEBUG_LOGGING) {
                console.log('[useAllPromotions] Loaded all promotions:', promotions.length);
            }

            return promotions;
        },
        enabled: isEnabled,
        staleTime: CACHE_STRATEGY.promotionsAndCategories.staleTime,
        gcTime: CACHE_STRATEGY.promotionsAndCategories.gcTime,
        placeholderData: (previousData: Promotion[] | undefined) => previousData,
    });
};
