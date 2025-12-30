/**
 * NetworkStatusIndicator - Indicateur de statut réseau
 *
 * Affiche un banner discret en cas de:
 * - Perte de connexion (offline)
 * - Connexion lente (2G/3G)
 * - Retour en ligne après avoir été offline
 */

import { useEffect, useState } from 'react';
import { WifiOff, Wifi, Activity } from 'lucide-react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

export function NetworkStatusIndicator() {
  const { isOnline, isSlowConnection, effectiveType } = useNetworkStatus();
  const [showOnlineNotification, setShowOnlineNotification] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      setWasOffline(true);
    } else if (wasOffline) {
      // User revient en ligne après avoir été offline
      setShowOnlineNotification(true);
      // Cacher après 5 secondes
      const timeout = setTimeout(() => {
        setShowOnlineNotification(false);
        setWasOffline(false);
      }, 5000);
      return () => clearTimeout(timeout);
    }
  }, [isOnline, wasOffline]);

  // Notification: retour en ligne (toast coin écran - non-intrusif)
  if (showOnlineNotification) {
    return (
      <div className="fixed top-20 right-4 z-40 bg-green-600 text-white px-4 py-2 rounded-lg shadow-xl flex items-center gap-2 animate-slide-down">
        <Wifi className="w-4 h-4" />
        <span className="text-sm font-medium">Connexion rétablie</span>
      </div>
    );
  }

  // Banner: hors ligne (compact, sous le header)
  if (!isOnline) {
    return (
      <div className="fixed top-16 left-0 right-0 z-40 bg-red-600 text-white">
        <div className="container mx-auto px-4 py-2 flex items-center justify-center gap-2">
          <WifiOff className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm font-medium">
            Mode hors ligne
          </span>
        </div>
      </div>
    );
  }

  // Banner: connexion lente (compact, sous le header)
  if (isSlowConnection) {
    return (
      <div className="fixed top-16 left-0 right-0 z-40 bg-amber-500 text-white">
        <div className="container mx-auto px-4 py-2 flex items-center justify-center gap-2">
          <Activity className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm font-medium">
            Connexion lente ({effectiveType?.toUpperCase()})
          </span>
        </div>
      </div>
    );
  }

  return null;
}
