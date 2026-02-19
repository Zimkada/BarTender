import { useState, useCallback, useRef } from 'react';

interface UseRobustOperationOptions {
  timeoutMs?: number;
  maxRetries?: number;
  onTimeout?: () => void;
  onOffline?: () => void;
  onError?: (error: Error) => void;
}

interface RobustOperationState {
  isLoading: boolean;
  isRetrying: boolean;
  error: string | null;
  timeoutWarning: boolean;
  retryCount: number;
}

/**
 * Hook pour gérer les opérations asynchrones robustes
 * Gère: timeout, retry, détection offline, feedback utilisateur
 */
export function useRobustOperation(options: UseRobustOperationOptions = {}) {
  const {
    timeoutMs = 5000,
    maxRetries = 2,
    onTimeout,
    onOffline,
    onError,
  } = options;

  const [state, setState] = useState<RobustOperationState>({
    isLoading: false,
    isRetrying: false,
    error: null,
    timeoutWarning: false,
    retryCount: 0,
  });

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Nettoyer le timeout
  const clearTimeout = useCallback(() => {
    if (timeoutRef.current) {
      global.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Exécuter une opération avec timeout et retry
  const executeAsync = useCallback(
    async <T,>(operation: () => Promise<T>): Promise<T | null> => {
      // Vérifier la connexion réseau
      if (!navigator.onLine) {
        const offlineMsg = 'Vous êtes hors ligne. Vérifiez votre connexion.';
        setState(prev => ({ ...prev, error: offlineMsg }));
        onOffline?.();
        return null;
      }

      setState(prev => ({
        ...prev,
        isLoading: true,
        error: null,
        timeoutWarning: false,
      }));

      try {
        // Créer une promesse avec timeout
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutRef.current = global.setTimeout(() => {
            const timeoutError = new Error('Opération expirée. Connexion lente.');
            reject(timeoutError);
          }, timeoutMs);
        });

        // Race entre l'opération et le timeout
        const result = await Promise.race([operation(), timeoutPromise]);
        clearTimeout();
        setState(prev => ({
          ...prev,
          isLoading: false,
          isRetrying: false,
          error: null,
          retryCount: 0,
        }));
        return result;
      } catch (error) {
        clearTimeout();
        const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue';

        // Vérifier si c'est un timeout
        const isTimeout = errorMessage.includes('expirée') || errorMessage.includes('Timeout');

        if (isTimeout) {
          onTimeout?.();
          setState(prev => ({
            ...prev,
            isLoading: false,
            timeoutWarning: true,
            error: 'Connexion lente. Réessayez?',
          }));
        } else {
          onError?.(error instanceof Error ? error : new Error(errorMessage));
          setState(prev => ({
            ...prev,
            isLoading: false,
            error: errorMessage,
          }));
        }

        return null;
      }
    },
    [timeoutMs, onTimeout, onOffline, onError, clearTimeout]
  );

  // Retry avec backoff exponentiel
  const retryAsync = useCallback(
    async <T,>(operation: () => Promise<T>): Promise<T | null> => {
      if (state.retryCount >= maxRetries) {
        setState(prev => ({
          ...prev,
          error: 'Impossible de completer l\'opération. Vérifiez votre connexion.',
        }));
        return null;
      }

      setState(prev => ({
        ...prev,
        isRetrying: true,
        retryCount: prev.retryCount + 1,
        error: null,
      }));

      // Attendre un peu avant de réessayer (backoff: 1s, 2s, etc)
      const backoffMs = 1000 * (state.retryCount + 1);
      await new Promise(resolve => global.setTimeout(resolve, backoffMs));

      return executeAsync(operation);
    },
    [state.retryCount, maxRetries, executeAsync]
  );

  // Réinitialiser l'état
  const reset = useCallback(() => {
    clearTimeout();
    setState({
      isLoading: false,
      isRetrying: false,
      error: null,
      timeoutWarning: false,
      retryCount: 0,
    });
  }, [clearTimeout]);

  return {
    ...state,
    executeAsync,
    retryAsync,
    reset,
    isOnline: navigator.onLine,
  };
}
