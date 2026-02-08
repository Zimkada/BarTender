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

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRealtimeSubscription } from './useRealtimeSubscription';
import { useBroadcastSync } from './useBroadcastSync';
import { broadcastService } from '../services/broadcast/BroadcastService';

interface UseSmartSyncConfig {
  table: string;
  event: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  barId?: string;
  enabled?: boolean;
  staleTime?: number; // ms until data is considered stale
  refetchInterval?: number; // Fallback polling interval (ms)
  /**
   * Optional: Specific React Query keys to invalidate on change.
   * If not provided, it will fallback to a best-guess based on [table, barId].
   */
  queryKeysToInvalidate?: readonly (readonly unknown[])[];
}

/**
 * Hook combining all synchronization strategies
 * Automatically chooses the most efficient method for data freshness
 */
export function useSmartSync(config: UseSmartSyncConfig) {
  const {
    table,
    event,
    barId,
    enabled = true,
    refetchInterval = 5000,
    queryKeysToInvalidate,
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
  // Determine keys to invalidate (explicit or best-guess)
  const keys: readonly (readonly unknown[])[] = queryKeysToInvalidate || (barId ? [[table, barId]] : [[table]]);

  const realtimeSubscription = useRealtimeSubscription({
    table,
    event: event,
    filter: barId ? `bar_id=eq.${barId}` : undefined,
    enabled: enabled && broadcastSupported,
    queryKeysToInvalidate: keys,
    fallbackPollingInterval: refetchInterval,
    onMessage: (payload) => {
      console.log(`[SmartSync] Realtime change detected for ${table}:`, payload.event);
      // When Realtime message received, broadcast to other tabs
      if (broadcastSupported) {
        broadcast(payload.event === 'DELETE' ? 'DELETE' : payload.event, payload.new || payload.old);
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
