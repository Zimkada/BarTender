// useSyncStatus.ts - Hook React pour accéder au système de synchronisation (Modern System A)
// Architecture: Combine offlineQueue + NetworkManager avec état React

import { useState, useEffect, useCallback } from 'react';
import { offlineQueue } from '../services/offlineQueue';
import { networkManager } from '../services/NetworkManager';
import { syncManager } from '../services/SyncManager'; // Pour déclencher la sync
import type { SyncStatus, NetworkStatus, SyncOperation } from '../types/sync';

/**
 * Hook pour accéder à l'état global de synchronisation (System A)
 */
export function useSyncStatus() {
  // État réseau
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>(
    networkManager.getStatus()
  );

  // État de la queue
  const [queueStats, setQueueStats] = useState({
    pendingCount: 0,
    syncingCount: 0,
    errorCount: 0,
    totalCount: 0
  });

  // Liste des erreurs (pour affichage modal)
  const [errorsList, setErrorsList] = useState<SyncOperation[]>([]);

  // Flag sync en cours (dérivé des stats ou du manager)
  const isSyncing = queueStats.syncingCount > 0;

  /**
   * S'abonner aux changements du NetworkManager
   */
  useEffect(() => {
    const unsubscribe = networkManager.subscribe((status) => {
      setNetworkStatus(status);
    });

    return unsubscribe;
  }, []);

  /**
   * S'abonner aux changements de la OfflineQueue
   */
  useEffect(() => {
    // Fonction de mise à jour des stats et erreurs
    const updateState = async () => {
      try {
        const stats = await offlineQueue.getStats();
        setQueueStats(stats);

        if (stats.errorCount > 0) {
          const errors = await offlineQueue.getOperations({ status: 'error' });
          setErrorsList(errors);
        } else {
          setErrorsList([]);
        }
      } catch (err) {
        console.error('Failed to get queue stats', err);
      }
    };

    // Initial load
    updateState();

    // Écouter les événements de la queue
    const handleQueueUpdate = () => {
      updateState();
    };

    const handleSyncComplete = () => {
      updateState();
    };

    window.addEventListener('queue-updated', handleQueueUpdate);
    window.addEventListener('sync-completed', handleSyncComplete);

    return () => {
      window.removeEventListener('queue-updated', handleQueueUpdate);
      window.removeEventListener('sync-completed', handleSyncComplete);
    };
  }, []);

  /**
   * Initialiser le NetworkManager au mount
   */
  useEffect(() => {
    networkManager.init();
    // syncManager.init() est déjà appelé dans App.tsx, pas besoin ici
    return () => {
      // Cleanup géré par App.tsx
    };
  }, []);

  /**
   * Force une vérification réseau immédiate et lance la sync
   */
  const forceNetworkCheck = useCallback(() => {
    networkManager.forceCheck();
    if (networkManager.isOnline()) {
      syncManager.syncAll();
    }
  }, []);

  /**
   * Réessaye toutes les opérations en erreur
   */
  const retryAll = useCallback(async () => {
    // Dans system A, syncAll gère les retries automatiquement
    // Mais on peut vouloir reset les compteurs d'erreur d'abord
    const errors = await offlineQueue.getOperations({ status: 'error' });
    for (const op of errors) {
      await offlineQueue.resetRetries(op.id);
    }
    syncManager.syncAll();
  }, []);

  /**
   * Réessaye une opération spécifique
   */
  const retryOperation = useCallback(async (operationId: string) => {
    await offlineQueue.resetRetries(operationId);
    syncManager.syncAll(); // Relancer la machine
  }, []);

  /**
   * Supprime une opération de la queue
   */
  const removeOperation = useCallback(async (operationId: string) => {
    await offlineQueue.removeOperation(operationId);
  }, []);

  /**
   * Vide complètement la queue (DANGER)
   */
  const clearQueue = useCallback(async () => {
    if (confirm('⚠️ Supprimer toutes les opérations en attente ? Cette action est irréversible.')) {
      await offlineQueue.clearQueue();
    }
  }, []);


  /**
   * État global de synchronisation
   */
  const syncStatus: SyncStatus = {
    networkStatus,
    pendingCount: queueStats.pendingCount,
    syncingCount: queueStats.syncingCount,
    errorCount: queueStats.errorCount,
    lastSyncAt: null, // Pas tracké pour l'instant
    isSyncing,
  };

  /**
   * Helpers de statut
   */
  const isOnline = networkStatus === 'online';
  const isOffline = networkStatus === 'offline';
  const hasErrors = queueStats.errorCount > 0;
  const hasPending = queueStats.pendingCount > 0;

  return {
    // État
    syncStatus,
    networkStatus,
    pendingCount: queueStats.pendingCount,
    syncingCount: queueStats.syncingCount,
    errorCount: queueStats.errorCount,
    totalCount: queueStats.totalCount,
    lastSyncAt: null,
    isSyncing,

    // Helpers
    isOnline,
    isOffline,
    hasErrors,
    hasPending,

    // Actions
    forceNetworkCheck,
    retryAll,
    retryOperation,
    removeOperation,
    clearQueue,
    getErrors: () => errorsList, // Retourne la liste d'état synchronisée
    errors: errorsList, // Alias direct
  };
}

/**
 * Hook léger pour juste le statut réseau (moins de re-renders)
 */
export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>(networkManager.getStatus());

  useEffect(() => {
    const unsubscribe = networkManager.subscribe(setStatus);
    return unsubscribe;
  }, []);

  return status;
}

/**
 * Hook léger pour juste les stats de la queue
 */
export function useQueueStats() {
  const [stats, setStats] = useState({
    pendingCount: 0,
    syncingCount: 0,
    errorCount: 0,
    totalCount: 0
  });

  useEffect(() => {
    const updateStats = async () => {
      const s = await offlineQueue.getStats();
      setStats(s);
    };
    updateStats();

    const handle = () => updateStats();
    window.addEventListener('queue-updated', handle);
    return () => window.removeEventListener('queue-updated', handle);
  }, []);

  return stats;
}
