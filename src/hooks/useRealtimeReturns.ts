/**
 * useRealtimeReturns.ts
 * Specialized hook for real-time returns synchronization
 * 
 * Subscribes to:
 * - New returns (INSERT)
 * - Return status changes (UPDATE) - validation, rejection, restocking
 * - Automatic stock invalidation when restocked
 * - Automatic stats invalidation when refunded
 */

import { useCallback } from 'react';
import { useRealtimeSubscription } from './useRealtimeSubscription';

interface UseRealtimeReturnsConfig {
    barId: string;
    enabled?: boolean;
}

/**
 * Hook for real-time returns updates
 * Automatically invalidates stock and stats queries when returns change
 *
 * @example
 * ```typescript
 * // In a component that displays returns
 * const { isConnected, error } = useRealtimeReturns({
 *   barId: currentBar.id,
 *   enabled: true,
 * });
 *
 * if (error) {
 *   console.warn('Real-time updates unavailable, using polling fallback');
 * }
 * ```
 */
export function useRealtimeReturns(config: UseRealtimeReturnsConfig) {
    const { barId, enabled = true } = config;

    // Don't subscribe if barId is not set
    const isConfigValid = barId && enabled;

    const handleReturnsMessage = useCallback((payload: any) => {
        console.log('[Realtime] Returns update received:', {
            event: payload.eventType,
            newData: payload.new?.id,
            oldData: payload.old?.id,
        });
    }, []);

    const handleError = useCallback((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[Realtime] Returns subscription error:', message);
        // Fallback: polling will be handled via React Query with appropriate staleTime
    }, []);

    // Subscribe to all returns INSERT for this bar
    const returnsSubscription = useRealtimeSubscription({
        table: 'returns',
        event: 'INSERT',
        filter: isConfigValid ? `bar_id=eq.${barId}` : undefined,
        enabled: Boolean(isConfigValid),
        onMessage: handleReturnsMessage,
        onError: handleError,
        fallbackPollingInterval: 30000, // 30 second polling fallback
        queryKeysToInvalidate: [
            ['returns', barId],
            ['stats', barId],
        ],
    });

    // Subscribe to returns status updates (validation, rejection, restocking)
    const statusSubscription = useRealtimeSubscription({
        table: 'returns',
        event: 'UPDATE',
        filter: isConfigValid ? `bar_id=eq.${barId}` : undefined,
        enabled: Boolean(isConfigValid),
        onMessage: handleReturnsMessage,
        onError: handleError,
        fallbackPollingInterval: 30000,
        queryKeysToInvalidate: [
            ['returns', barId],
            ['bar_products', barId], // Stock changes when restocked
            ['stats', barId],
        ],
    });

    return {
        isConnected:
            returnsSubscription.isConnected || statusSubscription.isConnected,
        error: returnsSubscription.error || statusSubscription.error,
        channels: {
            returns: returnsSubscription.channelId,
            status: statusSubscription.channelId,
        },
    };
}

export default useRealtimeReturns;
