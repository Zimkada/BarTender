import { ComponentType, lazy } from 'react';

interface RetryOptions {
  maxRetries?: number;
  retryDelay?: number;
}

/**
 * Wrapper React.lazy() avec retry automatique sur connexion instable.
 * Backoff exponentiel : 1s → 3s → 10s
 *
 * Usage :
 *   const DashboardPage = lazyWithRetry(() => import('./pages/DashboardPage'));
 *
 * Toujours préférer lazyWithRetry à lazy() pour les pages.
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  importFunc: () => Promise<{ default: T }>,
  options: RetryOptions = {}
): React.LazyExoticComponent<T> {
  const { maxRetries = 3, retryDelay = 1000 } = options;

  return lazy(() => new Promise<{ default: T }>((resolve, reject) => {
    let retryCount = 0;

    const attempt = () => {
      importFunc().then(resolve).catch((error) => {
        const isChunkError =
          error?.message?.includes('Failed to fetch dynamically imported module') ||
          error?.message?.includes('Importing a module script failed')             ||
          error?.message?.includes('error loading dynamically imported module')    ||
          error?.message?.includes('ERR_CONNECTION_TIMED_OUT')                    ||
          error?.name === 'ChunkLoadError';

        if (!isChunkError) { reject(error); return; }

        retryCount++;

        if (retryCount <= maxRetries) {
          const delays = [1000, 3000, 10_000];
          const delay  = delays[retryCount - 1] ?? retryDelay;
          console.log(`[lazyWithRetry] Retry ${retryCount}/${maxRetries} dans ${delay}ms`);
          setTimeout(attempt, delay);
        } else {
          console.error(`[lazyWithRetry] Échec après ${maxRetries} tentatives`);
          reject(error);
        }
      });
    };

    attempt();
  }));
}
