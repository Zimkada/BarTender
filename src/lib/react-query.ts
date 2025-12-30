import { QueryClient, MutationCache, QueryCache } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/query-persist-client-core';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import toast from 'react-hot-toast';
import { CACHE_STRATEGY } from './cache-strategy';

/**
 * Configuration Expert pour React Query
 * Optimisée pour :
 * 1. Stabilité réseau (retry intelligent)
 * 2. UX (Toast en cas d'erreur globale)
 * 3. Performance (Stale time agressif pour éviter les refetchs inutiles)
 * 4. Persistance Offline (sauvegarde du cache)
 */

// Fonction de retry personnalisée
const retryFn = (failureCount: number, error: any) => {
  // Ne pas réessayer si erreur 404 (Not Found) ou 401 (Unauthorized) ou 403 (Forbidden)
  if (error?.status === 404 || error?.status === 401 || error?.status === 403) return false;

  // Max 3 tentatives pour les autres erreurs
  return failureCount < 3;
};

// Gestionnaire d'erreur global pour les requêtes
const onError = (error: any) => {
  console.error('[React Query Error]', error);
  // On ne notifie pas les erreurs 401/403 car elles sont souvent gérées par l'auth interceptor
  if (error?.status !== 401 && error?.status !== 403) {
    const message = error?.message || 'Une erreur est survenue lors de la récupération des données';
    toast.error(message, { id: 'query-error' }); // id unique pour éviter les doublons
  }
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stratégie par défaut optimisée pour les opérations courantes (Ventes & Stock)
      // 5 min stale (évite flickering), 24h GC (offline)
      staleTime: CACHE_STRATEGY.salesAndStock.staleTime,
      gcTime: CACHE_STRATEGY.salesAndStock.gcTime,

      // Retry intelligent (max 2 fois au lieu de 3 pour éviter lenteur)
      retry: (failureCount, error: any) => {
        // Ne pas retry si erreur 404/401/403 OU erreur de timeout
        if (error?.status === 404 || error?.status === 401 || error?.status === 403) return false;
        if (error?.name === 'AbortError' || error?.message?.includes('aborted')) return false;
        // Max 2 tentatives (au lieu de 3) pour réduire la latence perçue
        return failureCount < 2;
      },
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
    onError: (error: any) => {
      // Notification automatique pour toutes les erreurs de mutation (écriture)
      const message = error?.message || 'Une erreur est survenue lors de l\'opération';
      toast.error(message);
    },
  }),
  queryCache: new QueryCache({
    onError,
  }),
});

// CONFIGURATION DE LA PERSISTANCE DU CACHE (OFFLINE-FIRST)
const localStoragePersister = createSyncStoragePersister({
  storage: window.localStorage,
});

persistQueryClient({
  queryClient,
  persister: localStoragePersister,
  maxAge: CACHE_STRATEGY.salesAndStock.gcTime, // Harmonisé avec GC Time
});
