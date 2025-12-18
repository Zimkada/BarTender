/**
 * useSmartSync.ts
 * Intelligent sync strategy combining Broadcast Channel + Realtime + Polling
 * Phase 3.3 - Supabase Optimization & Cost Reduction
 *
 * Strategy:
 * 1. BroadcastChannel (FREE): Sync with other tabs in same browser
 * 2. Realtime (COST): Sync with other users/devices
 * 3. Polling (FALLBACK): Fallback when Realtime unavailable
 *
 * Result: Maximum freshness with minimum Supabase cost
 */

import { useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRealtimeSubscription } from './useRealtimeSubscription';
import { useBroadcastSync } from './useBroadcastSync';
import { broadcastService } from '../services/broadcast/BroadcastService';

interface UseSmartSyncConfig {
  table: string;
  event: 'INSERT' | 'UPDATE' | 'DELETE';
  barId?: string;
  enabled?: boolean;
  staleTime?: number; // ms until data is considered stale
  refetchInterval?: number; // Fallback polling interval (ms)
}

/**
 * Hook combining all synchronization strategies
 * Automatically chooses the most efficient method for data freshness
 *
 * @example
 * ```typescript
 * function SalesPage() {
 *   const { barId } = useBar();
 *
 *   // Automatic sync: Broadcast → Realtime → Polling
 *   const sync = useSmartSync({
 *     table: 'sales',
 *     event: 'INSERT',
 *     barId,
 *     staleTime: 1000,      // 1 second
 *     refetchInterval: 5000, // 5 second fallback
 *   });
 *
 *   return (
 *     <>
 *       {sync.isSynced && <p>✓ Real-time sync active</p>}
 *       <SalesTable />
 *     </>
 *   );
 * }
 * ```
 */
export function useSmartSync(config: UseSmartSyncConfig) {
  const {
    table,
    event,
    barId,
    enabled = true,
    staleTime = 1000,
    refetchInterval = 5000,
  } = config;

  const queryClient = useQueryClient();
  const syncStatusRef = useRef<'broadcast' | 'realtime' | 'polling' | 'offline'>(
    'polling',
  );

  // 1. Set up Broadcast Channel (FREE - same tab/window sync)
  const { isSupported: broadcastSupported, broadcast, invalidate } = useBroadcastSync({
    table,
    barId,
    enabled,
  });

  // 2. Set up Realtime (COST - multi-tab/user sync)
  const realtimeSubscription = useRealtimeSubscription({
    table,
    event,
    filter: barId ? `bar_id=eq.${barId}` : undefined,
    enabled: enabled && broadcastSupported,
    queryKeysToInvalidate: barId ? [[table, barId].join()] : [[table]],
    fallbackPollingInterval: refetchInterval,
    onMessage: (payload) => {
      // When Realtime message received, broadcast to other tabs
      if (broadcastSupported) {
        broadcast(event, payload.new || payload.old);
      }
      syncStatusRef.current = 'realtime';
    },
    onError: (error) => {
      console.warn(`[SmartSync] Realtime error for ${table}:`, error.message);
      syncStatusRef.current = 'polling';
    },
  });

  // Initialize broadcast service with query client
  useEffect(() => {
    if (broadcastSupported) {
      broadcastService.setQueryClient(queryClient);
      syncStatusRef.current = 'broadcast';
    }
  }, [queryClient, broadcastSupported]);

  // Determine overall sync status
  const isSynced =
    realtimeSubscription.isConnected || broadcastSupported;

  const syncStatus = realtimeSubscription.isConnected
    ? 'realtime'
    : broadcastSupported
      ? 'broadcast'
      : 'polling';

  return {
    // Status indicators
    isSynced,
    syncStatus,
    isRealtimeConnected: realtimeSubscription.isConnected,
    isBroadcastSupported: broadcastSupported,
    error: realtimeSubscription.error,

    // Manual control
    broadcast,
    invalidate,

    // Channel info
    channelId: realtimeSubscription.channelId,
  };
}

export default useSmartSync;
