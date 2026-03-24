/**
 * useRealtimeReturns.ts
 * Specialized hook for real-time returns synchronization
 *
 * ⭐ Merged into a single '*' subscription (was 2 channels: INSERT + UPDATE)
 * to halve Supabase Realtime cost. Stock invalidation only on UPDATE (restocking).
 */

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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
    const queryClient = useQueryClient();

    // Don't subscribe if barId is not set
    const isConfigValid = barId && enabled;

    const handleReturnsMessage = useCallback((payload: any) => {
        console.log('[Realtime] Returns update received:', {
            event: payload.eventType,
            newData: payload.new?.id,
            oldData: payload.old?.id,
        });

        // ⭐ Invalidate stock only on UPDATE (restocking puts items back)
        if (payload.eventType === 'UPDATE') {
            queryClient.invalidateQueries({ queryKey: ['bar_products', barId] });
        }
    }, [queryClient, barId]);

    const handleError = useCallback((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[Realtime] Returns subscription error:', message);
        // Fallback: polling will be handled via React Query with appropriate staleTime
    }, []);

    // ⭐ Single subscription for ALL return events (INSERT + UPDATE + DELETE)
    // Halves Supabase Realtime cost (was 2 separate channels)
    const returnsSubscription = useRealtimeSubscription(
        'returns',
        '*',
        isConfigValid ? `bar_id=eq.${barId}` : undefined,
        {
            enabled: Boolean(isConfigValid),
            onMessage: handleReturnsMessage,
            onError: handleError,
            fallbackPollingInterval: 30000,
            queryKeysToInvalidate: [
                ['returns', barId],
                ['stats', barId],
            ],
        }
    );

    return {
        isConnected: returnsSubscription.isConnected,
        error: returnsSubscription.error,
        channels: {
            returns: returnsSubscription.channelId,
        },
    };
}

export default useRealtimeReturns;
