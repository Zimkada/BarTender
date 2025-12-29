/**
 * useNetworkStatus - Hook pour détecter l'état de la connexion réseau
 *
 * Retourne:
 * - isOnline: boolean (true = connecté, false = hors ligne)
 * - isSlowConnection: boolean (true si connexion 2G/3G lente)
 * - effectiveType: string ('4g', '3g', '2g', 'slow-2g')
 */

import { useState, useEffect } from 'react';

interface NetworkInformation extends EventTarget {
  effectiveType?: '4g' | '3g' | '2g' | 'slow-2g';
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
  addEventListener(type: 'change', listener: () => void): void;
  removeEventListener(type: 'change', listener: () => void): void;
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
  return (navigator as any).connection ||
         (navigator as any).mozConnection ||
         (navigator as any).webkitConnection;
}

function isSlowConnection(connection?: NetworkInformation): boolean {
  if (!connection) return false;

  // Considérer comme lente:
  // - 2G ou slow-2G
  // - RTT > 400ms (Round Trip Time)
  // - downlink < 1 Mbps
  return (
    connection.effectiveType === '2g' ||
    connection.effectiveType === 'slow-2g' ||
    (connection.rtt !== undefined && connection.rtt > 400) ||
    (connection.downlink !== undefined && connection.downlink < 1)
  );
}
