/**
 * QueryClient — Configuration Expert React Query
 *
 * Optimisé pour :
 * 1. Stabilité réseau  — retry intelligent (skip 401/403/404/AbortError)
 * 2. UX               — toast global sur erreur de mutation
 * 3. Performance      — staleTime agressif, pas de refetch inutile
 * 4. Offline-first    — persistance localStorage des queries critiques
 */

import { QueryClient, MutationCache, QueryCache } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/query-persist-client-core';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { CACHE_STRATEGY } from './cache-strategy';

// ─── Retry intelligent ────────────────────────────────────────────────────────
const retryFn = (failureCount: number, error: unknown): boolean => {
  const err = error as { status?: number; name?: string; message?: string };

  // Ne pas retry sur erreurs statiques (auth, not found)
  if ([401, 403, 404].includes(err?.status ?? 0)) return false;
  // Ne pas retry sur annulation volontaire
  if (err?.name === 'AbortError' || err?.message?.includes('aborted')) return false;
  // Max 2 tentatives
  return failureCount < 2;
};

// ─── Gestionnaire d'erreur global ─────────────────────────────────────────────
const handleQueryError = (error: unknown): void => {
  console.error('[React Query]', error);
  const err = error as { status?: number; message?: string; name?: string };

  if (err?.name === 'AbortError' || err?.message?.includes('aborted')) return;
  if (err?.status === 401 || err?.status === 403) return; // géré par auth interceptor

  const message = err?.message ?? 'Une erreur est survenue lors de la récupération des données';
  import('react-hot-toast').then(({ default: toast }) => {
    toast.error(message, { id: 'query-error' });
  });
};

// ─── QueryClient ──────────────────────────────────────────────────────────────
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:          CACHE_STRATEGY.realtime.staleTime,
      gcTime:             CACHE_STRATEGY.realtime.gcTime,
      retry:              retryFn,
      retryDelay:         (i) => Math.min(500 * 2 ** i, 2000),
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
  // Toast automatique sur toute erreur de mutation
  mutationCache: new MutationCache({
    onError: (error: unknown) => {
      const err = error as { message?: string; name?: string };
      if (err?.name === 'AbortError' || err?.message?.includes('aborted')) return;

      const message = err?.message ?? 'Une erreur est survenue lors de l\'opération';
      import('react-hot-toast').then(({ default: toast }) => {
        toast.error(message);
      });
    },
  }),
  queryCache: new QueryCache({ onError: handleQueryError }),
});

// ─── Persistance offline (localStorage) ──────────────────────────────────────
const persister = createAsyncStoragePersister({
  storage: {
    getItem:    async (key) => window.localStorage.getItem(key),
    setItem:    async (key, value) => window.localStorage.setItem(key, value),
    removeItem: async (key) => window.localStorage.removeItem(key),
  },
  throttleTime: 1000,
});

persistQueryClient({
  queryClient: queryClient as Parameters<typeof persistQueryClient>[0]['queryClient'],
  persister,
  maxAge: CACHE_STRATEGY.realtime.gcTime,
  dehydrateOptions: {
    shouldDehydrateQuery: (query) => {
      // ⚠️ À adapter : persister uniquement les queries critiques pour l'offline
      const key = query.queryKey[0] as string;
      return key?.includes('items') || key?.includes('products');
    },
  },
});
