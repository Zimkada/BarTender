import { useEffect } from 'react';

/**
 * Hook pour précharger des routes en arrière-plan
 * Améliore l'expérience utilisateur en chargeant les pages avant qu'elles soient nécessaires
 *
 * @param imports - Tableau de fonctions d'import dynamique à précharger
 * @param enabled - Condition pour activer le preload (ex: isSuperAdmin)
 *
 * @example
 * // Précharger les pages admin dès que l'utilisateur est SuperAdmin
 * useRoutePreload([
 *   () => import('../pages/admin/BarsManagementPage'),
 *   () => import('../pages/admin/UsersManagementPage'),
 * ], isSuperAdmin);
 */
export function useRoutePreload(
  imports: Array<() => Promise<unknown>>,
  enabled: boolean = true
) {
  useEffect(() => {
    if (!enabled) return;

    const preloadRoutes = () => {
      console.log(`[useRoutePreload] Préchargement de ${imports.length} routes...`);

      imports.forEach((importFunc, index) => {
        importFunc()
          .then(() => {
            console.log(`[useRoutePreload] Route ${index + 1}/${imports.length} préchargée ✓`);
          })
          .catch((error) => {
            console.warn(`[useRoutePreload] Échec préchargement route ${index + 1}:`, error.message);
            // Ne pas bloquer si le preload échoue - ce n'est qu'une optimisation
          });
      });
    };

    // Laisser le navigateur choisir un moment idle. Fallback à 5s si l'API n'existe pas.
    if ('requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(preloadRoutes, { timeout: 5000 });
      return () => window.cancelIdleCallback(idleId);
    }

    const timeout = window.setTimeout(preloadRoutes, 5000);
    return () => window.clearTimeout(timeout);
  }, [imports, enabled]);
}
