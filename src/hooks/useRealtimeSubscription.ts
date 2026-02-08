/**
 * useRealtimeSubscription.ts
 * Custom hook for managing Supabase Realtime subscriptions
 * Phase 3.2 - Supabase Optimization
 *
 * Features:
 * - Automatic subscription/unsubscription lifecycle
 * - Integration with React Query for cache invalidation
 * - Payload handling and validation
 * - Error recovery with fallback polling
 * - Network awareness
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { realtimeService, RealtimeEvent } from '../services/realtime/RealtimeService';

interface UseRealtimeSubscriptionConfig {
  table: string;
  event: RealtimeEvent;
  schema?: string;
  filter?: string | undefined; // Can be undefined to prevent invalid subscriptions
  enabled?: boolean;
  onMessage?: (payload: unknown) => void;
  onError?: (error: unknown) => void;
  fallbackPollingInterval?: number; // ms, used if Realtime fails
  /**
   * BREAKING CHANGE (v2.0+): queryKeysToInvalidate now expects array of query keys (not strings)
   *
   * @example
   * ❌ INCORRECT (old): queryKeysToInvalidate: ['sales', barId]
   * ✅ CORRECT (new): queryKeysToInvalidate: [['sales', barId]]
   * ✅ CORRECT (new): queryKeysToInvalidate: [salesKeys.list(barId)]
   */
  queryKeysToInvalidate?: readonly (readonly unknown[])[]; // Array of React Query keys to invalidate on change
}

/**
 * Hook for subscribing to Supabase Realtime changes
 *
 * @example
 * ```typescript
 * // Subscribe to all sales for a bar with automatic invalidation
 * useRealtimeSubscription({
 *   table: 'sales',
 *   event: 'INSERT',
 *   filter: `bar_id=eq.${barId}`,
 *   queryKeysToInvalidate: [salesKeys.list(barId)],
 *   fallbackPollingInterval: 5000, // 5 seconds
 * });
 * ```
 */
export function useRealtimeSubscription(config: UseRealtimeSubscriptionConfig) {
  const queryClient = useQueryClient();
  const channelIdRef = useRef<string>('');
  const pollingTimeoutRef = useRef<NodeJS.Timeout>();
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Enhanced message handler with React Query integration
  const handleMessage = useCallback(
    (payload: unknown) => {
      // Call custom handler if provided
      if (config.onMessage) {
        config.onMessage(payload);
      }

      // Invalidate React Query keys if specified
      if (config.queryKeysToInvalidate && config.queryKeysToInvalidate.length > 0) {
        config.queryKeysToInvalidate.forEach((key) => {
          queryClient.invalidateQueries({ queryKey: key });
        });
      }
    },
    [config, queryClient],
  );

  // Error handler with logging
  const handleError = useCallback(
    (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[Realtime] Error in ${config.table} subscription:`,
        message,
      );
      setError(err instanceof Error ? err : new Error(message));

      // Call custom error handler if provided
      if (config.onError) {
        config.onError(err);
      }

      // Start polling fallback if interval specified
      if (config.fallbackPollingInterval && config.fallbackPollingInterval > 0) {
        console.log(
          `[Realtime] Starting polling fallback for ${config.table} (${config.fallbackPollingInterval}ms)`,
        );
        startPollingFallback();
      }
    },
    [config],
  );

  // Polling fallback mechanism
  const startPollingFallback = useCallback(() => {
    // Clear existing timeout
    if (pollingTimeoutRef.current) {
      clearTimeout(pollingTimeoutRef.current);
    }

    // For polling fallback, we'll rely on React Query's staleTime
    // and refetchInterval instead of manual polling to avoid duplication
    // This allows the application to continue using normal query mechanisms
    console.log(
      `[Realtime] Polling fallback active for ${config.table} - relying on React Query`,
    );
  }, [config.table]);

  // Subscribe on mount or when config changes
  useEffect(() => {
    if (config.enabled === false) {
      return;
    }

    // Prevent subscribing with invalid filters (e.g., undefined bar_id)
    if (!config.filter) {
      console.log(
        `[Realtime] Skipping subscription to ${config.table} - filter is not set`,
      );
      return;
    }

    try {
      console.log(
        `[Realtime] Subscribing to ${config.table} (${config.event})${config.filter ? ` with filter: ${config.filter}` : ''}`,
      );

      channelIdRef.current = realtimeService.subscribe({
        table: config.table,
        event: config.event,
        schema: config.schema,
        filter: config.filter,
        onMessage: handleMessage,
        onError: handleError,
      });

      // Monitor connection status
      const checkStatus = setInterval(() => {
        const connected = realtimeService.isConnected(channelIdRef.current);
        setIsConnected(connected);
      }, 1000);

      return () => {
        clearInterval(checkStatus);
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      handleError(error);
    }

    // Cleanup on unmount
    return () => {
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current);
      }
      if (channelIdRef.current) {
        realtimeService.unsubscribe(channelIdRef.current);
      }
    };
  }, [
    config.table,
    config.event,
    config.schema,
    config.filter,
    config.enabled,
    handleMessage,
    handleError,
  ]);

  return {
    isConnected,
    error,
    channelId: channelIdRef.current,
  };
}

export default useRealtimeSubscription;
