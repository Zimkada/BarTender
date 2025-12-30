import { ComponentType, lazy } from 'react';

interface RetryOptions {
  maxRetries?: number;
  retryDelay?: number;
}

/**
 * Wrapper autour de React.lazy() qui ajoute un mécanisme de retry automatique
 * en cas d'échec de chargement du chunk (connexion instable, timeout, etc.)
 *
 * @param importFunc - La fonction d'import dynamique
 * @param options - Options de retry (maxRetries, retryDelay)
 *
 * @example
 * const DashboardPage = lazyWithRetry(() => import('./pages/DashboardPage'));
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  importFunc: () => Promise<{ default: T }>,
  options: RetryOptions = {}
): React.LazyExoticComponent<T> {
  const { maxRetries = 3, retryDelay = 1000 } = options;

  return lazy(() => {
    return new Promise<{ default: T }>((resolve, reject) => {
      let retryCount = 0;

      const attemptImport = () => {
        importFunc()
          .then(resolve)
          .catch((error) => {
            // Vérifier si c'est une erreur de chunk loading
            const isChunkLoadError =
              error?.message?.includes('Failed to fetch dynamically imported module') ||
              error?.message?.includes('Importing a module script failed') ||
              error?.message?.includes('error loading dynamically imported module') ||
              error?.message?.includes('ERR_CONNECTION_TIMED_OUT') ||
              error?.name === 'ChunkLoadError';

            if (!isChunkLoadError) {
              // Si ce n'est pas une erreur de chunk, rejeter immédiatement
              reject(error);
              return;
            }

            retryCount++;

            if (retryCount <= maxRetries) {
              // Exponential backoff: 1s, 3s, 10s
              const delays = [1000, 3000, 10000];
              const delay = delays[retryCount - 1] || retryDelay;

              console.log(
                `[lazyWithRetry] Chunk load failed, retrying ${retryCount}/${maxRetries} in ${delay}ms...`,
                error.message
              );

              setTimeout(() => {
                attemptImport();
              }, delay);
            } else {
              console.error(
                `[lazyWithRetry] Failed to load chunk after ${maxRetries} retries`,
                error
              );
              reject(error);
            }
          });
      };

      attemptImport();
    });
  });
}
