/**
 * useRealtimePromotions.ts
 * Specialized hook for real-time promotions synchronization
 * 
 * Subscribes to:
 * - New promotions (INSERT)
 * - Promotion updates (UPDATE)
 * - Promotion deletions (DELETE)
 * - Automatic promotions cache invalidation
 */

import { useCallback } from 'react';
import { useRealtimeSubscription } from './useRealtimeSubscription';

interface UseRealtimePromotionsConfig {
    barId: string;
    enabled?: boolean;
}

/**
 * Hook for real-time promotions updates
 * Automatically invalidates promotions queries when promotions change
 *
 * @example
 * ```typescript
 * // In usePromotions hook
 * const { isConnected, error } = useRealtimePromotions({
 *   barId: currentBar.id,
 *   enabled: true,
 * });
 *
 * if (error) {
 *   console.warn('Real-time updates unavailable, using polling fallback');
 * }
 * ```
 */
export function useRealtimePromotions(config: UseRealtimePromotionsConfig) {
    const { barId, enabled = true } = config;

    // Don't subscribe if barId is not set
    const isConfigValid = barId && enabled;

    const handlePromotionMessage = useCallback((payload: any) => {
        console.log('[Realtime] Promotions update received:', {
            event: payload.eventType,
            newData: payload.new?.id,
            oldData: payload.old?.id,
        });
    }, []);

    const handleError = useCallback((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[Realtime] Promotions subscription error:', message);
        // Fallback: polling will be handled via React Query with appropriate staleTime
    }, []);

    // Subscribe to promotions INSERT
    const insertSubscription = useRealtimeSubscription({
        table: 'promotions',
        event: 'INSERT',
        filter: isConfigValid ? `bar_id=eq.${barId}` : undefined,
        enabled: !!isConfigValid,
        onMessage: handlePromotionMessage,
        onError: handleError,
        fallbackPollingInterval: 30000, // 30 second polling fallback
        queryKeysToInvalidate: [
            ['promotions', barId],
        ],
    });

    // Subscribe to promotions UPDATE
    const updateSubscription = useRealtimeSubscription({
        table: 'promotions',
        event: 'UPDATE',
        filter: isConfigValid ? `bar_id=eq.${barId}` : undefined,
        enabled: !!isConfigValid,
        onMessage: handlePromotionMessage,
        onError: handleError,
        fallbackPollingInterval: 30000,
        queryKeysToInvalidate: [
            ['promotions', barId],
        ],
    });

    // Subscribe to promotions DELETE
    const deleteSubscription = useRealtimeSubscription({
        table: 'promotions',
        event: 'DELETE',
        filter: isConfigValid ? `bar_id=eq.${barId}` : undefined,
        enabled: !!isConfigValid,
        onMessage: handlePromotionMessage,
        onError: handleError,
        fallbackPollingInterval: 30000,
        queryKeysToInvalidate: [
            ['promotions', barId],
        ],
    });

    return {
        isConnected:
            insertSubscription.isConnected ||
            updateSubscription.isConnected ||
            deleteSubscription.isConnected,
        error:
            insertSubscription.error ||
            updateSubscription.error ||
            deleteSubscription.error,
        channels: {
            insert: insertSubscription.channelId,
            update: updateSubscription.channelId,
            delete: deleteSubscription.channelId,
        },
    };
}

export default useRealtimePromotions;
