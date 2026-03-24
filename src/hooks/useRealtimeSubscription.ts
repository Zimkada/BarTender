/**
 * useRealtimeSubscription.ts
 * Custom hook for managing Supabase Realtime subscriptions
 * Phase 3.2 - Supabase Optimization
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { realtimeService, RealtimeEvent } from '../services/realtime/RealtimeService';

interface UseRealtimeSubscriptionOptions {
  schema?: string;
  enabled?: boolean;
  onMessage?: (payload: unknown) => void;
  onError?: (error: unknown) => void;
  fallbackPollingInterval?: number;
  queryKeysToInvalidate?: readonly (readonly unknown[])[];
}

export function useRealtimeSubscription(
  table: string,
  event: RealtimeEvent,
  filter?: string,
  options: UseRealtimeSubscriptionOptions = {}
) {
  const {
    schema = 'public',
    enabled = true,
    onMessage,
    onError,
    fallbackPollingInterval,
    queryKeysToInvalidate
  } = options;

  const queryClient = useQueryClient();
  const channelIdRef = useRef<string>('');
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // 🛡️ STABILITY FIX: Use refs for callbacks to prevent unnecessary re-subscriptions
  const onMessageRef = useRef(onMessage);
  const onErrorRef = useRef(onError);
  const queryKeysRef = useRef(queryKeysToInvalidate);

  useEffect(() => {
    onMessageRef.current = onMessage;
    onErrorRef.current = onError;
    queryKeysRef.current = queryKeysToInvalidate;
  }, [onMessage, onError, queryKeysToInvalidate]);

  // ⭐ Throttled invalidation: max 1 invalidation per query key per second
  // Prevents render storms from burst Realtime events (e.g., batch stock import)
  const pendingInvalidations = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const throttledInvalidate = useCallback(
    (keys: readonly (readonly unknown[])[]) => {
      keys.forEach((key) => {
        const keyStr = JSON.stringify(key);
        if (!pendingInvalidations.current.has(keyStr)) {
          pendingInvalidations.current.set(
            keyStr,
            setTimeout(() => {
              queryClient.invalidateQueries({ queryKey: key });
              pendingInvalidations.current.delete(keyStr);
            }, 1000),
          );
        }
      });
    },
    [queryClient],
  );

  // Enhanced message handler with React Query integration
  const handleMessage = useCallback(
    (payload: unknown) => {
      // Custom handler called immediately (not throttled)
      if (onMessageRef.current) {
        onMessageRef.current(payload);
      }

      // React Query invalidation is throttled to prevent burst overload
      if (queryKeysRef.current && queryKeysRef.current.length > 0) {
        throttledInvalidate(queryKeysRef.current);
      }
    },
    [throttledInvalidate],
  );

  // Error handler with logging
  const handleError = useCallback(
    (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Realtime] Error in ${table} subscription:`, message);
      setError(err instanceof Error ? err : new Error(message));

      if (onErrorRef.current) {
        onErrorRef.current(err);
      }

      if (fallbackPollingInterval && fallbackPollingInterval > 0) {
        console.log(`[Realtime] Starting polling fallback for ${table}`);
      }
    },
    [table, fallbackPollingInterval],
  );

  // Subscribe on mount or when critical functional deps change
  useEffect(() => {
    if (enabled === false || !filter) {
      return;
    }

    try {
      console.log(`[Realtime] Subscribing to ${table} (${event}) with filter: ${filter}`);

      const id = realtimeService.subscribe({
        table,
        event,
        schema,
        filter,
        onMessage: handleMessage,
        onError: handleError,
      });

      channelIdRef.current = id;

      // Check connection status periodically (5s — status changes are rare, no need for 1s)
      const checkStatus = setInterval(() => {
        const connected = realtimeService.isConnected(channelIdRef.current);
        setIsConnected(connected);
      }, 5000);

      // 🛡️ GUARANTEED CLEANUP: Close channel when component unmounts or deps change
      const pendingTimers = pendingInvalidations.current;
      return () => {
        clearInterval(checkStatus);
        // Clear pending throttled invalidations
        pendingTimers.forEach((timer) => clearTimeout(timer));
        pendingTimers.clear();
        if (channelIdRef.current) {
          console.log(`[Realtime] Unsubscribing from ${table} (${channelIdRef.current})`);
          realtimeService.unsubscribe(channelIdRef.current);
          channelIdRef.current = '';
        }
      };
    } catch (err) {
      handleError(err);
    }
  }, [enabled, table, event, schema, filter, handleMessage, handleError]);

  return {
    isConnected,
    error,
    channelId: channelIdRef.current,
  };
}



export default useRealtimeSubscription;
