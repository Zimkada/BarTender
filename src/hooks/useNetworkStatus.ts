/**
 * useNetworkStatus - Hook pour détecter l'état de la connexion réseau
 *
 * Retourne:
 * - isOnline: boolean (true = connecté, false = hors ligne)
 * - isSlowConnection: boolean (true si connexion 2G/3G lente)
 * - effectiveType: string ('4g', '3g', '2g', 'slow-2g')
 */

import { useState, useEffect } from 'react';

/**
 * ✅ Type-safe declaration for Network Information API (experimental)
 */
interface NetworkInformation extends EventTarget {
  effectiveType?: '4g' | '3g' | '2g' | 'slow-2g';
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
  addEventListener(type: 'change', listener: () => void): void;
  removeEventListener(type: 'change', listener: () => void): void;
}

/**
 * ✅ Extended Navigator with experimental Network Information API
 * Support multi-navigateur:
 * - Chrome/Edge: navigator.connection
 * - Firefox: navigator.mozConnection
 * - Safari: navigator.webkitConnection
 */
interface NavigatorWithNetworkInfo extends Navigator {
  connection?: NetworkInformation;
  mozConnection?: NetworkInformation;
  webkitConnection?: NetworkInformation;
}

export interface NetworkStatus {
  isOnline: boolean;
  isSlowConnection: boolean;
  effectiveType?: '4g' | '3g' | '2g' | 'slow-2g';
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}

export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>(() => {
    const connection = getConnection();
    return {
      isOnline: navigator.onLine,
      isSlowConnection: isSlowConnection(connection),
      effectiveType: connection?.effectiveType,
      downlink: connection?.downlink,
      rtt: connection?.rtt,
      saveData: connection?.saveData,
    };
  });

  useEffect(() => {
    const updateOnlineStatus = () => {
      const connection = getConnection();
      setStatus({
        isOnline: navigator.onLine,
        isSlowConnection: isSlowConnection(connection),
        effectiveType: connection?.effectiveType,
        downlink: connection?.downlink,
        rtt: connection?.rtt,
        saveData: connection?.saveData,
      });
    };

    const updateConnectionStatus = () => {
      const connection = getConnection();
      setStatus(prev => ({
        ...prev,
        isSlowConnection: isSlowConnection(connection),
        effectiveType: connection?.effectiveType,
        downlink: connection?.downlink,
        rtt: connection?.rtt,
        saveData: connection?.saveData,
      }));
    };

    // Écouter les changements de connexion
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    const connection = getConnection();
    if (connection) {
      connection.addEventListener('change', updateConnectionStatus);
    }

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);

      if (connection) {
        connection.removeEventListener('change', updateConnectionStatus);
      }
    };
  }, []);

  return status;
}

function getConnection(): NetworkInformation | undefined {
  // ✅ Type-safe cast to access experimental Network Information API
  const nav = navigator as NavigatorWithNetworkInfo;
  return nav.connection || nav.mozConnection || nav.webkitConnection;
}

function isSlowConnection(connection?: NetworkInformation): boolean {
  if (!connection) return false;

  // Considérer comme lente:
  // - 3G, 2G ou slow-2G
  // - RTT > 300ms (Round Trip Time)
  // - downlink < 1 Mbps
  //
  // ⭐ La 3G est volontairement incluse : c'est le cas le plus fréquent chez nos
  // utilisateurs, et sans elle l'application paraissait simplement lente sans
  // aucune explication à l'écran — le bar en concluait que l'application ne
  // marche pas. Le seuil RTT passe de 400 à 300ms pour la même raison (une 3G
  // moyenne tourne autour de 100-300ms et échappait au seuil précédent).
  // Contrepartie assumée : le badge "Réseau lent" devient nettement plus
  // fréquent en zone mal couverte.
  return (
    connection.effectiveType === '3g' ||
    connection.effectiveType === '2g' ||
    connection.effectiveType === 'slow-2g' ||
    (connection.rtt !== undefined && connection.rtt > 300) ||
    (connection.downlink !== undefined && connection.downlink < 1)
  );
}
