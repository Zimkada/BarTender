// useSyncStatus.ts - Hook React pour accéder au système de synchronisation
// Architecture: Combine SyncQueue + NetworkManager avec état React

import { useState, useEffect, useCallback } from 'react';
import { syncQueue } from '../services/SyncQueue';
import { networkManager } from '../services/NetworkManager';
import type { SyncStatus, NetworkStatus, SyncOperation } from '../types/sync';

/**
 * Hook pour accéder à l'état global de synchronisation
 *
 * Fournit:
 * - Statut réseau (online/offline/checking)
 * - Nombre d'opérations pending/syncing/error
 * - Actions (retry, clear, forceCheck)
 *
 * @example
 * const { networkStatus, pendingCount, retryAll } = useSyncStatus();
 *
 * return (
 *   <Badge color={networkStatus === 'online' ? 'green' : 'red'}>
 *     {pendingCount} en attente
 *   </Badge>
 * );
 */
export function useSyncStatus() {
  // État réseau
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>(
    networkManager.getStatus()
  );

  // État de la queue
  const [queueStats, setQueueStats] = useState(() => syncQueue.getStats());

  // Timestamp dernier sync (pour affichage "il y a X minutes")
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);

  // Flag sync en cours
  const [isSyncing, setIsSyncing] = useState(false);

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
   * S'abonner aux changements de la SyncQueue
   */
  useEffect(() => {
    const unsubscribe = syncQueue.subscribe((queue) => {
      const stats = syncQueue.getStats();
      setQueueStats(stats);

      // Mettre à jour isSyncing
      setIsSyncing(stats.syncing > 0);
    });

    return unsubscribe;
  }, []);

  /**
   * Initialiser le NetworkManager au mount
   */
  useEffect(() => {
    networkManager.init();

    return () => {
      networkManager.cleanup();
    };
  }, []);

  /**
   * Force une vérification réseau immédiate
   */
  const forceNetworkCheck = useCallback(() => {
    networkManager.forceCheck();
  }, []);

  /**
   * Réessaye toutes les opérations en erreur
   */
  const retryAll = useCallback(() => {
    syncQueue.retryAll();
  }, []);

  /**
   * Réessaye une opération spécifique
   */
  const retryOperation = useCallback((operationId: string) => {
    syncQueue.retryOperation(operationId);
  }, []);

  /**
   * Supprime une opération de la queue
   */
  const removeOperation = useCallback((operationId: string) => {
    syncQueue.remove(operationId);
  }, []);

  /**
   * Vide complètement la queue (DANGER)
   */
  const clearQueue = useCallback(() => {
    if (confirm('⚠️ Supprimer toutes les opérations en attente ? Cette action est irréversible.')) {
      syncQueue.clear();
    }
  }, []);

  /**
   * Récupère toutes les opérations en erreur
   */
  const getErrors = useCallback((): SyncOperation[] => {
    return syncQueue.getErrors();
  }, []);

  /**
   * Récupère toutes les opérations pending
   */
  const getPending = useCallback((): SyncOperation[] => {
    return syncQueue.getPending();
  }, []);

  /**
   * État global de synchronisation
   */
  const syncStatus: SyncStatus = {
    networkStatus,
    pendingCount: queueStats.pending,
    syncingCount: queueStats.syncing,
    errorCount: queueStats.error,
    lastSyncAt,
    isSyncing,
  };

  /**
   * Helpers de statut
   */
  const isOnline = networkStatus === 'online';
  const isOffline = networkStatus === 'offline';
  const hasErrors = queueStats.error > 0;
  const hasPending = queueStats.pending > 0;

  return {
    // État
    syncStatus,
    networkStatus,
    pendingCount: queueStats.pending,
    syncingCount: queueStats.syncing,
    errorCount: queueStats.error,
    totalCount: queueStats.total,
    lastSyncAt,
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
    getErrors,
    getPending,
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
  const [stats, setStats] = useState(() => syncQueue.getStats());

  useEffect(() => {
    const unsubscribe = syncQueue.subscribe(() => {
      setStats(syncQueue.getStats());
    });
    return unsubscribe;
  }, []);

  return stats;
}
