/**
 * useRealtimeSubscription.ts
 * Custom hook for managing Supabase Realtime subscriptions
 * Phase 3.2 - Supabase Optimization
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { realtimeService, RealtimeEvent } from '../services/realtime/RealtimeService';

/** Forme minimale d'un payload postgres_changes utilisée par les patchers */
export interface RealtimeChangePayload {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new?: Record<string, unknown>;
  old?: Record<string, unknown>;
}

// ⚡ Dédup module-level de la réconciliation post-reconnexion : plusieurs instances
// de hook partagent le même canal Realtime et détectent la même reconnexion sur des
// ticks (5s) décalés — sans dédup, N instances déclencheraient N refetch des mêmes
// clés. Une réconciliation par clé par fenêtre de 10s suffit.
const lastReconcileAt = new Map<string, number>();
const RECONCILE_DEDUP_MS = 10_000;

interface UseRealtimeSubscriptionOptions {
  schema?: string;
  enabled?: boolean;
  onMessage?: (payload: unknown) => void;
  onError?: (error: unknown) => void;
  fallbackPollingInterval?: number;
  queryKeysToInvalidate?: readonly (readonly unknown[])[];
  /**
   * ⚡ Egress: patch ciblé du cache React Query à partir du payload Realtime.
   * Retourne `true` si l'événement a été appliqué au cache → l'invalidation
   * (et donc le refetch complet) est court-circuitée. Retourne `false` pour
   * retomber sur l'invalidation classique (comportement historique).
   * `throttledInvalidate` est fourni pour toute invalidation partielle que le
   * patcher doit déclencher lui-même (variantes non patchables, clés dérivées) :
   * il respecte l'anti-burst (max 1 invalidation/clé/seconde) — ne jamais
   * appeler queryClient.invalidateQueries en direct depuis un patcher.
   */
  applyChange?: (
    payload: RealtimeChangePayload,
    throttledInvalidate: (keys: readonly (readonly unknown[])[]) => void,
  ) => boolean;
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
    queryKeysToInvalidate,
    applyChange
  } = options;

  const queryClient = useQueryClient();
  const channelIdRef = useRef<string>('');
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // 🛡️ STABILITY FIX: Use refs for callbacks to prevent unnecessary re-subscriptions
  const onMessageRef = useRef(onMessage);
  const onErrorRef = useRef(onError);
  const queryKeysRef = useRef(queryKeysToInvalidate);
  const applyChangeRef = useRef(applyChange);

  useEffect(() => {
    onMessageRef.current = onMessage;
    onErrorRef.current = onError;
    queryKeysRef.current = queryKeysToInvalidate;
    applyChangeRef.current = applyChange;
  }, [onMessage, onError, queryKeysToInvalidate, applyChange]);

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

      // ⚡ Egress: tenter le patch ciblé du cache avant toute invalidation.
      // Si le patcher échoue (retour false ou exception), fallback refetch.
      let handled = false;
      if (applyChangeRef.current) {
        try {
          handled = applyChangeRef.current(payload as RealtimeChangePayload, throttledInvalidate);
        } catch (err) {
          console.error(`[Realtime] applyChange failed for ${table}, fallback invalidate:`, err);
          handled = false;
        }
      }

      // React Query invalidation is throttled to prevent burst overload
      if (!handled && queryKeysRef.current && queryKeysRef.current.length > 0) {
        throttledInvalidate(queryKeysRef.current);
      }
    },
    [throttledInvalidate, table],
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
      // ⚡ Réconciliation : après une COUPURE (déconnecté → reconnecté), des événements
      // Realtime ont pu être perdus (Supabase ne rejoue pas les messages manqués).
      // On invalide alors les queries une fois pour resynchroniser le cache avec le serveur.
      // La 1ère connexion (montage) est exclue : le fetch initial vient d'avoir lieu.
      let wasConnected = false;
      let hasConnectedOnce = false;
      const checkStatus = setInterval(() => {
        const connected = realtimeService.isConnected(channelIdRef.current);
        if (connected && !wasConnected && hasConnectedOnce) {
          const now = Date.now();
          queryKeysRef.current?.forEach((key) => {
            const keyStr = JSON.stringify(key);
            if (now - (lastReconcileAt.get(keyStr) ?? 0) < RECONCILE_DEDUP_MS) return;
            lastReconcileAt.set(keyStr, now);
            console.log(`[Realtime] Reconnected to ${table} — reconciling cache (invalidate)`);
            queryClient.invalidateQueries({ queryKey: key });
          });
        }
        if (connected) hasConnectedOnce = true;
        wasConnected = connected;
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
  }, [enabled, table, event, schema, filter, handleMessage, handleError, queryClient]);

  return {
    isConnected,
    error,
    channelId: channelIdRef.current,
  };
}



export default useRealtimeSubscription;
