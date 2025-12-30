/**
 * useRealtimeSales.ts
 * Specialized hook for real-time sales synchronization
 * Phase 3.2 - Supabase Optimization
 *
 * Subscribes to:
 * - New sales (INSERT)
 * - Sale status changes (UPDATE)
 * - Automatic stock invalidation
 * - Automatic stats invalidation
 */

import { useCallback } from 'react';
import { useRealtimeSubscription } from './useRealtimeSubscription';

interface UseRealtimeSalesConfig {
  barId: string;
  enabled?: boolean;
}

/**
 * Hook for real-time sales updates
 * Automatically invalidates stock and stats queries when sales change
 *
 * @example
 * ```typescript
 * // In a component that displays sales
 * const { isConnected, error } = useRealtimeSales({
 *   barId: currentBar.id,
 *   enabled: true,
 * });
 *
 * if (error) {
 *   console.warn('Real-time updates unavailable, using polling fallback');
 * }
 * ```
 */
export function useRealtimeSales(config: UseRealtimeSalesConfig) {
  const { barId, enabled = true } = config;

  // Don't subscribe if barId is not set
  const isConfigValid = barId && enabled;

  const handleSalesMessage = useCallback((payload: any) => {
    console.log('[Realtime] Sales update received:', {
      event: payload.eventType,
      newData: payload.new?.id,
      oldData: payload.old?.id,
    });
  }, []);

  const handleError = useCallback((error: Error) => {
    console.error('[Realtime] Sales subscription error:', error.message);
    // Fallback: polling will be handled via React Query with appropriate staleTime
  }, []);

  // Subscribe to all sales INSERT and UPDATE for this bar
  const salesSubscription = useRealtimeSubscription({
    table: 'sales',
    event: 'INSERT',
    filter: isConfigValid ? `bar_id=eq.${barId}` : undefined,
    enabled: isConfigValid,
    onMessage: handleSalesMessage,
    onError: handleError,
    fallbackPollingInterval: 30000, // 30 second polling fallback
    queryKeysToInvalidate: [
      ['sales', barId],
      ['bar_products', barId],
      ['stats', barId],
    ],
  });

  // Subscribe to sales status updates (validation, rejection)
  const statusSubscription = useRealtimeSubscription({
    table: 'sales',
    event: 'UPDATE',
    filter: isConfigValid ? `bar_id=eq.${barId}` : undefined,
    enabled: isConfigValid,
    onMessage: handleSalesMessage,
    onError: handleError,
    fallbackPollingInterval: 30000,
    queryKeysToInvalidate: [
      ['sales', barId],
      ['stats', barId],
    ],
  });

  return {
    isConnected:
      salesSubscription.isConnected || statusSubscription.isConnected,
    error: salesSubscription.error || statusSubscription.error,
    channels: {
      sales: salesSubscription.channelId,
      status: statusSubscription.channelId,
    },
  };
}

export default useRealtimeSales;
