/**
 * useRealtimeSubscription.ts
 * Custom hook for managing Supabase Realtime subscriptions
 * Phase 3.2 - Supabase Optimization
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { realtimeService, RealtimeEvent } from '../services/realtime/RealtimeService';

interface UseRealtimeSubscriptionConfig {
  table: string;
  event: RealtimeEvent;
  schema?: string;
  filter?: string | undefined;
  enabled?: boolean;
  onMessage?: (payload: unknown) => void;
  onError?: (error: unknown) => void;
  fallbackPollingInterval?: number;
  queryKeysToInvalidate?: readonly (readonly unknown[])[];
}

export function useRealtimeSubscription(config: UseRealtimeSubscriptionConfig) {
  const queryClient = useQueryClient();
  const channelIdRef = useRef<string>('');
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // 🛡️ STABILITY FIX: Use ref for config to prevent unnecessary re-subscriptions
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // Enhanced message handler with React Query integration
  const handleMessage = useCallback(
    (payload: unknown) => {
      if (configRef.current.onMessage) {
        configRef.current.onMessage(payload);
      }

      if (configRef.current.queryKeysToInvalidate && configRef.current.queryKeysToInvalidate.length > 0) {
        configRef.current.queryKeysToInvalidate.forEach((key) => {
          queryClient.invalidateQueries({ queryKey: key });
        });
      }
    },
    [queryClient],
  );

  // Error handler with logging
  const handleError = useCallback(
    (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Realtime] Error in ${configRef.current.table} subscription:`, message);
      setError(err instanceof Error ? err : new Error(message));

      if (configRef.current.onError) {
        configRef.current.onError(err);
      }

      if (configRef.current.fallbackPollingInterval && configRef.current.fallbackPollingInterval > 0) {
        console.log(`[Realtime] Starting polling fallback for ${configRef.current.table}`);
      }
    },
    [],
  );

  // Subscribe on mount or when critical functional deps change
  useEffect(() => {
    if (config.enabled === false || !config.filter) {
      return;
    }

    try {
      console.log(`[Realtime] Subscribing to ${config.table} (${config.event}) with filter: ${config.filter}`);

      const id = realtimeService.subscribe({
        table: config.table,
        event: config.event,
        schema: config.schema,
        filter: config.filter,
        onMessage: handleMessage,
        onError: handleError,
      });

      channelIdRef.current = id;

      const checkStatus = setInterval(() => {
        const connected = realtimeService.isConnected(channelIdRef.current);
        setIsConnected(connected);
      }, 1000);

      // 🛡️ GUARANTEED CLEANUP: Close channel when component unmounts or deps change
      return () => {
        clearInterval(checkStatus);
        if (channelIdRef.current) {
          console.log(`[Realtime] Unsubscribing from ${config.table} (${channelIdRef.current})`);
          realtimeService.unsubscribe(channelIdRef.current);
          channelIdRef.current = '';
        }
      };
    } catch (err) {
      handleError(err);
    }
  }, [config.enabled, config.table, config.event, config.schema, config.filter, handleMessage, handleError]);

  return {
    isConnected,
    error,
    channelId: channelIdRef.current,
  };
}

export default useRealtimeSubscription;
