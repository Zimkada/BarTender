import { useState, useEffect, useCallback } from 'react';
import { useNotifications } from '../components/Notifications';
import { offlineQueue } from '../services/offlineQueue';

interface OfflineStatus {
  isOnline: boolean;
  pendingOperations: number;
  lastSyncTime: Date | null;
}

export function useOfflineStatus() {
  const { showNotification } = useNotifications();
  const [status, setStatus] = useState<OfflineStatus>({
    isOnline: navigator.onLine,
    pendingOperations: 0,
    lastSyncTime: null
  });

  // Mettre à jour le nombre d'opérations en attente
  const updatePendingCount = useCallback((count: number) => {
    setStatus(prev => ({ ...prev, pendingOperations: count }));
  }, []);

  // Mettre à jour l'heure de dernière sync
  const updateLastSync = useCallback(() => {
    setStatus(prev => ({ ...prev, lastSyncTime: new Date() }));
  }, []);


  // Charger les opérations en attente depuis localStorage
  useEffect(() => {
    const operations = offlineQueue.getAll();
    setStatus(prev => ({ ...prev, pendingOperations: operations.length }));

    // Écouter les changements de queue
    const handleQueueUpdate = (event: CustomEvent) => {
        setStatus(prev => ({ ...prev, pendingOperations: event.detail.count }));
    };

    window.addEventListener('queue-updated', handleQueueUpdate as EventListener);
    
    return () => {
        window.removeEventListener('queue-updated', handleQueueUpdate as EventListener);
    };
    }, []);

  // Écouter les changements de connexion
  useEffect(() => {
    const handleOnline = () => {
        setStatus(prev => ({ ...prev, isOnline: true }));
        showNotification('success', '✅ Connexion rétablie');
        // Déclencher la synchronisation
        window.dispatchEvent(new Event('sync-required'));
        };

    const handleOffline = () => {
      setStatus(prev => ({ ...prev, isOnline: false }));
      showNotification('info', '📵 Mode hors-ligne activé');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [showNotification]);

    // Écouter les événements de synchronisation
    useEffect(() => {
        const handleSyncCompleted = () => {
            updateLastSync();
            showNotification('success', '✅ Données synchronisées');
        };

        const handleSyncFailed = (event: CustomEvent) => {
            showNotification('error', `❌ Échec de synchronisation: ${event.detail.operation.type}`);
        };

        window.addEventListener('sync-completed', handleSyncCompleted);
        window.addEventListener('sync-failed', handleSyncFailed as EventListener);

        return () => {
            window.removeEventListener('sync-completed', handleSyncCompleted);
            window.removeEventListener('sync-failed', handleSyncFailed as EventListener);
        };
        }, [updateLastSync, showNotification]);

  
  return {
    ...status,
    updatePendingCount,
    updateLastSync
  };
}