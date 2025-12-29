/**
 * useNetworkBannerHeight - Hook pour calculer la hauteur du banner réseau
 *
 * Retourne la hauteur du banner pour ajuster le padding du contenu principal
 * et éviter que le banner ne cache le header ou le contenu
 */

import { useNetworkStatus } from './useNetworkStatus';

export function useNetworkBannerHeight(): number {
  const { isOnline, isSlowConnection } = useNetworkStatus();

  // Banner offline ou connexion lente = 40px de hauteur (py-2 compact)
  // Toast "connexion rétablie" = 0px (coin écran, pas de shift nécessaire)
  if (!isOnline || isSlowConnection) {
    return 40; // hauteur du banner compact (py-2 = 8px top + 8px bottom + ~24px contenu)
  }

  return 0;
}
