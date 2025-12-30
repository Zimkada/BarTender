/**
 * NetworkBadge - Badge compact d'indicateur réseau pour le header
 *
 * Affiche un badge discret dans le header au lieu d'un banner pleine largeur
 */

import { WifiOff, Wifi, Activity } from 'lucide-react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

export function NetworkBadge() {
  const { isOnline, isSlowConnection, effectiveType } = useNetworkStatus();

  // Online + connexion normale = pas d'affichage
  if (isOnline && !isSlowConnection) {
    return null;
  }

  // Badge offline (prioritaire)
  if (!isOnline) {
    return (
      <div
        className="flex items-center gap-1.5 px-2 py-1 bg-red-500/90 rounded-md text-white text-xs font-medium"
        title="Mode hors ligne - Certaines fonctionnalités sont limitées"
      >
        <WifiOff className="w-3.5 h-3.5 flex-shrink-0" />
        <span>Hors ligne</span>
      </div>
    );
  }

  // Badge connexion lente
  if (isSlowConnection) {
    return (
      <div
        className="flex items-center gap-1.5 px-2 py-1 bg-amber-500/90 rounded-md text-white text-xs font-medium"
        title={`Connexion ${effectiveType?.toUpperCase()} - Chargement optimisé`}
      >
        <Activity className="w-3.5 h-3.5 flex-shrink-0" />
        <span>Connexion {effectiveType?.toUpperCase()}</span>
      </div>
    );
  }

  return null;
}
