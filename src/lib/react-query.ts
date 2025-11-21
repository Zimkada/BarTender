import { QueryClient, MutationCache, QueryCache } from '@tanstack/react-query';
import toast from 'react-hot-toast';

/**
 * Configuration Expert pour React Query
 * Optimisée pour :
 * 1. Stabilité réseau (retry intelligent)
 * 2. UX (Toast en cas d'erreur globale)
 * 3. Performance (Stale time agressif pour éviter les refetchs inutiles)
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
      // Données considérées fraîches pendant 5 minutes
      staleTime: 5 * 60 * 1000,
      // Garder en cache pendant 24h (pour le support offline futur)
      gcTime: 24 * 60 * 60 * 1000,
      // Retry intelligent
      retry: retryFn,
      // Délai exponentiel entre les retries (1s, 2s, 4s...)
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      // Ne pas refetcher si on change de fenêtre (sauf si stale)
      refetchOnWindowFocus: false,
      // Gestion d'erreur globale (optionnel, souvent mieux géré au niveau composant)
      // mais utile pour le debugging
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
