import { QueryClient, MutationCache, QueryCache } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/query-persist-client-core';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { CACHE_STRATEGY } from './cache-strategy';

/**
 * Configuration Expert pour React Query
 * Optimisée pour :
 * 1. Stabilité réseau (retry intelligent)
 * 2. UX (Toast en cas d'erreur globale)
 * 3. Performance (Stale time agressif pour éviter les refetchs inutiles)
 * 4. Persistance Offline (sauvegarde du cache)
 */

// ✨ CONFIGURATION DES RETRIES (Optimisée pour éviter le spam 401/403/404)
const retryFn = (failureCount: number, error: unknown) => {
  // 🛡️ Type Guard: Sécurisation de l'erreur
  const err = error as { status?: number; name?: string; message?: string };

  // 1. Ne pas retry si erreur 404/401/403 (Statique/Auth)
  if (err?.status === 404 || err?.status === 401 || err?.status === 403) return false;
  // 2. Ne pas retry si la requête a été annulée volontairement
  if (err?.name === 'AbortError' || err?.message?.includes('aborted')) return false;
  // 3. Max 2 tentatives (au lieu de 3 par défaut) pour réduire la latence perçue en cas d'erreur
  return failureCount < 2;
};

// Gestionnaire d'erreur global pour les requêtes
const onError = (error: unknown) => {
  console.error('[React Query Error]', error);
  const err = error as { status?: number; message?: string; name?: string };

  // Ignorer les erreurs d'annulation (AbortError = comportement normal lors de reconnexion/timeout)
  if (err?.name === 'AbortError' || err?.message?.includes('aborted')) {
    return; // Pas de notification pour les AbortError
  }

  // On ne notifie pas les erreurs 401/403 car elles sont souvent gérées par l'auth interceptor
  if (err?.status !== 401 && err?.status !== 403) {
    const message = err?.message || 'Une erreur est survenue lors de la récupération des données';
    import('react-hot-toast').then(({ default: toast }) => {
      toast.error(message, { id: 'query-error' }); // id unique pour éviter les doublons
    });
  }
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stratégie par défaut optimisée pour les opérations courantes (Ventes & Stock)
      // 5 min stale (évite flickering), 24h GC (offline)
      staleTime: CACHE_STRATEGY.salesAndStock.staleTime,
      gcTime: CACHE_STRATEGY.salesAndStock.gcTime,

      // Retry intelligent via fonction dédiée
      retry: retryFn,
      // Délai réduit entre retries (500ms, 1s) au lieu de (1s, 2s, 4s)
      retryDelay: (attemptIndex) => Math.min(500 * 2 ** attemptIndex, 2000),
      // Ne pas refetcher si on change de fenêtre (sauf si stale)
      refetchOnWindowFocus: false,
      // Gestion d'erreur globale
    },
    mutations: {
      // Pas de retry automatique sur les mutations (sauf cas très spécifiques)
      retry: false,
    },
  },
  // Cache global pour intercepter les erreurs de mutation
  mutationCache: new MutationCache({
    onError: (error: unknown) => {
      // Ignorer les erreurs d'annulation (AbortError = comportement normal lors de reconnexion/timeout)
      const err = error as { message?: string; name?: string };
      if (err?.name === 'AbortError' || err?.message?.includes('aborted')) {
        return; // Pas de notification pour les AbortError
      }

      // Notification automatique pour toutes les erreurs de mutation (écriture)
      const message = err?.message || 'Une erreur est survenue lors de l\'opération';
      import('react-hot-toast').then(({ default: toast }) => {
        toast.error(message);
      });
    },
  }),
  queryCache: new QueryCache({
    onError,
  }),
});

// CONFIGURATION DE LA PERSISTANCE DU CACHE (OFFLINE-FIRST)
// Utilisation de la persistance ASYNCHRONE pour éviter de bloquer le thread principal
const asyncStoragePersister = createAsyncStoragePersister({
  storage: {
    getItem: async (key) => {
      const value = window.localStorage.getItem(key);
      return value;
    },
    setItem: async (key, value) => {
      window.localStorage.setItem(key, value);
    },
    removeItem: async (key) => {
      window.localStorage.removeItem(key);
    },
  },
  throttleTime: 1000, // Sweet spot: réactivité vs charge (Vérifié par audit expert)
});

persistQueryClient({
  queryClient: queryClient as any,
  persister: asyncStoragePersister,
  maxAge: CACHE_STRATEGY.salesAndStock.gcTime, // Harmonisé avec GC Time
  // Désactiver la restoration automatique au démarrage (lazy restore)
  // Cela évite de bloquer le thread principal pendant le chargement initial
  dehydrateOptions: {
    shouldDehydrateQuery: (query) => {
      // Ne persister que les queries critiques (ventes, stock)
      const queryKey = query.queryKey[0] as string;
      return queryKey?.includes('sales') || queryKey?.includes('stock') || queryKey?.includes('products');
    },
  },
});
