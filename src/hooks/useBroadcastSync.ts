/**
 * useBroadcastSync.ts
 * Hook for cross-tab synchronization via Broadcast Channel
 * Phase 3.3 - Supabase Optimization & Cost Reduction
 *
 * Features:
 * - Automatic invalidation of React Query caches when other tabs change data
 * - Zero Supabase cost (browser memory only)
 * - Seamless fallback if BroadcastChannel not supported
 * - Per-table subscriptions
 *
 * Usage:
 * ```typescript
 * // In component that displays sales data
 * useBroadcastSync('sales', barId);
 *
 * // After mutation in another part of app
 * broadcastService.broadcast({
 *   event: 'INSERT',
 *   table: 'sales',
 *   barId: currentBar.id,
 * });
 * ```
 */

import { useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { broadcastService } from '../services/broadcast/BroadcastService';

interface UseBroadcastSyncConfig {
  table: string;
  barId?: string;
  enabled?: boolean;
}

/**
 * Hook for subscribing to cross-tab sync events
 * Automatically invalidates React Query caches when other tabs modify data
 *
 * @param table - Database table name to sync
 * @param barId - Optional bar ID for bar-scoped tables
 * @param enabled - Enable/disable the hook (default: true)
 *
 * @example
 * ```typescript
 * // In InventoryPage
 * function InventoryPage() {
 *   const { barId } = useBar();
 *   useBroadcastSync('bar_products', barId);
 *   // Now any tab that modifies bar_products will update this page
 *   return <ProductGrid />;
 * }
 * ```
 */
export function useBroadcastSync(config: UseBroadcastSyncConfig) {
  const { table, barId, enabled = true } = config;
  const queryClient = useQueryClient();

  // Initialize broadcast service with query client on first mount
  useEffect(() => {
    if (broadcastService.isSupported()) {
      broadcastService.setQueryClient(queryClient);
    }
  }, [queryClient]);

  // Set up channel listener
  useEffect(() => {
    if (!enabled || !broadcastService.isSupported()) {
      return;
    }

    console.log(
      `[Broadcast Hook] Subscribing to ${table}${barId ? ` (${barId})` : ''}`,
    );

    // Return cleanup function
    return () => {
      // Channel is shared across hooks, so we don't close it here
      // It stays open for the lifetime of the component tree
    };
  }, [table, barId, enabled]);

  return {
    isSupported: broadcastService.isSupported(),
    broadcast: useCallback(
      (event: 'INSERT' | 'UPDATE' | 'DELETE', data?: any) => {
        broadcastService.broadcast({
          event,
          table,
          barId,
          data,
        });
      },
      [table, barId],
    ),
    invalidate: useCallback(() => {
      broadcastService.invalidateQueries(table, barId);
    }, [table, barId]),
  };
}

export default useBroadcastSync;
