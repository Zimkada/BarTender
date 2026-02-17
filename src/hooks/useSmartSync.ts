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

import { useEffect, useRef, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRealtimeSubscription } from './useRealtimeSubscription';
import { useBroadcastSync } from './useBroadcastSync';
import { broadcastService } from '../services/broadcast/BroadcastService';
import { useDebouncedCallback } from 'use-debounce';

/**
 * 🛡️ DEFENSIVE: Safe debounce with fallback
 * If use-debounce library fails, falls back to direct callback
 */
const useSafeDebounce = <T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T & { cancel?: () => void } => {
  try {
    return useDebouncedCallback(callback, delay) as any;
  } catch (error) {
    console.error('[SmartSync] Debounce library failed, using direct callback:', error);
    // Fallback: return callback as-is with noop cancel
    const fallback = callback as T & { cancel?: () => void };
    fallback.cancel = () => { };
    return fallback;
  }
};

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

  /**
   * Optional: List of custom window events to listen to for local invalidation.
   * Useful for SyncManager integration (e.g. 'sales-synced', 'stock-synced').
   */
  windowEvents?: string[];
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
  const keys: readonly (readonly unknown[])[] = useMemo(() =>
    queryKeysToInvalidate || (barId ? [[table, barId]] : [[table]]),
    [queryKeysToInvalidate, table, barId]
  );

  // 🛡️ STABILITY FIX: Memoize config to prevent infinite loop of unmount/remount
  // in useRealtimeSubscription when useSmartSync re-renders
  const realtimeConfig = useMemo(() => ({
    table,
    event: event,
    filter: barId ? `bar_id=eq.${barId}` : undefined,
    // 🛡️ FIX: Disable subscription if barId is missing (filter would be invalid)
    // This prevents Realtime subscription errors when barId is undefined
    enabled: enabled && broadcastSupported && !!barId,
    queryKeysToInvalidate: keys,
    fallbackPollingInterval: refetchInterval,
    onMessage: (payload: any) => {
      console.log(`[SmartSync] Realtime change detected for ${table}:`, payload.event);
      // When Realtime message received, broadcast to other tabs
      if (broadcastSupported) {
        broadcast(payload.event === 'DELETE' ? 'DELETE' : payload.event, payload.new || payload.old);
      }
      syncStatusRef.current = 'realtime';
    },
    onError: (error: any) => {
      console.warn(`[SmartSync] Realtime error for ${table}:`, error.message || error);
      syncStatusRef.current = 'polling';
    },
  }), [table, event, barId, enabled, broadcastSupported, keys, refetchInterval, broadcast]);

  const realtimeSubscription = useRealtimeSubscription(realtimeConfig);

  // 3. Set up Local Window Event Listener (SYNC MANAGER - same tab sync)
  // 🚀 Debounce to prevent render storms from rapid SyncManager events
  const handleWindowEvent = useSafeDebounce((e: Event) => {
    const customEvent = e as CustomEvent;
    // If event has barId detail, check if it matches
    if (barId && customEvent.detail?.barId && customEvent.detail.barId !== barId) {
      return;
    }

    console.log(`[SmartSync] Local window event detected (debounced): ${e.type}`);
    // Invalidate queries
    if (keys.length > 0) {
      keys.forEach(key => queryClient.invalidateQueries({ queryKey: key }));
    }
  }, 100); // 100ms debounce

  // 🛡️ FIX MEMORY LEAK: Stable reference to prevent listener accumulation on re-renders
  // Without this, each re-render would add a NEW listener but removeEventListener
  // wouldn't remove the OLD ones because handleWindowEvent reference changes
  const stableHandlerRef = useRef(handleWindowEvent);
  stableHandlerRef.current = handleWindowEvent;

  useEffect(() => {
    if (!config.windowEvents || config.windowEvents.length === 0) return;

    // Use stable reference that won't change between renders
    const listener = (e: Event) => stableHandlerRef.current(e);

    config.windowEvents.forEach((event: string) => {
      window.addEventListener(event, listener);
    });

    return () => {
      handleWindowEvent.cancel?.(); // ✅ Optional chaining for safety
      if (config.windowEvents) {
        config.windowEvents.forEach((event: string) => {
          window.removeEventListener(event, listener); // ✅ Same listener reference!
        });
      }
    };
  }, [config.windowEvents]); // ✅ handleWindowEvent NOT in deps - prevents re-run

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
