/**
 * useRealtimeStock.ts
 * Specialized hook for real-time stock synchronization
 * Phase 3.2 - Supabase Optimization
 *
 * Subscribes to:
 * - Product updates (price, stock level changes)
 * - Supply arrivals (inventory replenishment)
 * - Consignment status changes
 * - Automatic inventory invalidation
 */

import { useCallback } from 'react';
import { useRealtimeSubscription } from './useRealtimeSubscription';

interface UseRealtimeStockConfig {
  barId: string;
  enabled?: boolean;
}

/**
 * Hook for real-time stock/inventory updates
 * Automatically invalidates product and supply queries when stock changes
 *
 * @example
 * ```typescript
 * // In inventory page or product list
 * const { isConnected, error } = useRealtimeStock({
 *   barId: currentBar.id,
 *   enabled: true,
 * });
 *
 * if (!isConnected) {
 *   // Show indicator that real-time is unavailable
 * }
 * ```
 */
export function useRealtimeStock(config: UseRealtimeStockConfig) {
  const { barId, enabled = true } = config;

  const handleStockMessage = useCallback((payload: any) => {
    console.log('[Realtime] Stock update received:', {
      event: payload.eventType,
      productId: payload.new?.id || payload.old?.id,
      changes: payload.new ? Object.keys(payload.new) : [],
    });
  }, []);

  const handleError = useCallback((error: Error) => {
    console.error('[Realtime] Stock subscription error:', error.message);
    // Fallback: polling will be handled via React Query
  }, []);

  // Subscribe to product updates (price, stock level changes)
  const productsSubscription = useRealtimeSubscription({
    table: 'bar_products',
    event: 'UPDATE',
    filter: `bar_id=eq.${barId}`,
    enabled,
    onMessage: handleStockMessage,
    onError: handleError,
    fallbackPollingInterval: 10000, // 10 second polling fallback
    queryKeysToInvalidate: [['bar_products', barId]],
  });

  // Subscribe to supply arrivals (inventory replenishment)
  const suppliesSubscription = useRealtimeSubscription({
    table: 'supplies',
    event: 'INSERT',
    filter: `bar_id=eq.${barId}`,
    enabled,
    onMessage: handleStockMessage,
    onError: handleError,
    fallbackPollingInterval: 30000, // 30 second polling fallback
    queryKeysToInvalidate: [
      ['supplies', barId],
      ['bar_products', barId], // Also invalidate products (CUMP changes)
    ],
  });

  // Subscribe to consignment status changes
  const consignmentsSubscription = useRealtimeSubscription({
    table: 'consignments',
    event: 'UPDATE',
    filter: `bar_id=eq.${barId}`,
    enabled,
    onMessage: handleStockMessage,
    onError: handleError,
    fallbackPollingInterval: 15000, // 15 second polling fallback
    queryKeysToInvalidate: [['consignments', barId]],
  });

  // Determine overall connection status (at least one must be connected for stock updates)
  const isConnected =
    productsSubscription.isConnected ||
    suppliesSubscription.isConnected ||
    consignmentsSubscription.isConnected;

  const error =
    productsSubscription.error ||
    suppliesSubscription.error ||
    consignmentsSubscription.error;

  return {
    isConnected,
    error,
    channels: {
      products: productsSubscription.channelId,
      supplies: suppliesSubscription.channelId,
      consignments: consignmentsSubscription.channelId,
    },
  };
}

export default useRealtimeStock;
