// SyncHandler.ts - Service pour traiter la queue de synchronisation
// Architecture: Processor + API client stub (prêt pour Supabase)

import type { SyncOperation, SyncResult } from '../types/sync';
import { syncQueue } from './SyncQueue';
import { networkManager } from './NetworkManager';

/**
 * Type de callback pour notifier les erreurs de sync
 */
type SyncErrorCallback = (operation: SyncOperation, error: string) => void;

/**
 * Service de traitement de la queue de synchronisation
 *
 * Responsabilités:
 * - Traiter les opérations en attente dans la queue
 * - Communiquer avec le backend (Supabase futur)
 * - Gérer les retry automatiques
 * - Notifier les erreurs
 *
 * Pattern: Singleton avec processing périodique
 */
class SyncHandlerService {
  private isProcessing = false;
  private processingInterval: number | null = null;
  private errorCallbacks: Set<SyncErrorCallback> = new Set();

  /**
   * Démarre le processing automatique de la queue
   *
   * @param intervalMs - Intervalle entre chaque tentative (défaut: 5 secondes)
   */
  start(intervalMs: number = 5000): void {
    if (this.processingInterval !== null) {
      console.warn('[SyncHandler] Already started');
      return;
    }

    console.log(`[SyncHandler] Starting auto-processing (interval: ${intervalMs}ms)`);

    // Traiter immédiatement au démarrage
    this.processQueue();

    // Puis traiter périodiquement
    this.processingInterval = window.setInterval(() => {
      this.processQueue();
    }, intervalMs);

    // S'abonner aux changements de statut réseau
    networkManager.subscribe((status) => {
      if (status === 'online') {
        console.log('[SyncHandler] Network back online, processing queue...');
        this.processQueue();
      }
    });
  }

  /**
   * Arrête le processing automatique
   */
  stop(): void {
    if (this.processingInterval !== null) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      console.log('[SyncHandler] Stopped auto-processing');
    }
  }

  /**
   * Traite toutes les opérations en attente dans la queue
   *
   * Processing FIFO avec respect de l'ordre pour garantir l'intégrité des données
   */
  async processQueue(): Promise<void> {
    // Éviter le traitement concurrent
    if (this.isProcessing) {
      return;
    }

    // Vérifier qu'on est online
    const netStatus = networkManager.getStatus();
    if (netStatus !== 'online') {
      return;
    }

    this.isProcessing = true;

    try {
      // Traiter les opérations une par une (FIFO)
      while (true) {
        const operation = syncQueue.peek();
        if (!operation) {
          break; // Queue vide
        }

        // Vérifier si l'opération peut être retryée
        if (!this.canRetry(operation)) {
          console.error(`[SyncHandler] Max retries exceeded for operation ${operation.id}`, operation);
          this.notifyError(operation, 'Max retries exceeded');
          syncQueue.remove(operation.id);
          continue;
        }

        try {
          // Tenter la synchronisation
          const result = await this.syncToBackend(operation);

          if (result.success) {
            syncQueue.markAsSuccess(operation.id);
            console.log(`[SyncHandler] ✅ Operation ${operation.id} synced successfully`);
          } else {
            // Échec mais peut réessayer
            const errorMsg = result.error || 'Unknown error';
            syncQueue.markAsError(operation.id, errorMsg);

            if (result.shouldRetry) {
              console.warn(`[SyncHandler] ⚠️ Operation ${operation.id} failed, will retry: ${errorMsg}`);
            } else {
              console.error(`[SyncHandler] ❌ Operation ${operation.id} failed permanently: ${errorMsg}`);
              this.notifyError(operation, errorMsg);
              syncQueue.remove(operation.id);
            }
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          syncQueue.markAsError(operation.id, errorMsg);
          console.error(`[SyncHandler] ❌ Unexpected error syncing operation ${operation.id}:`, error);
        }

        // Petite pause pour éviter de surcharger le réseau
        await this.delay(100);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Vérifie si une opération peut être retryée
   */
  private canRetry(operation: SyncOperation): boolean {
    const MAX_RETRIES = 5;
    return operation.retryCount < MAX_RETRIES;
  }

  /**
   * Envoie une opération au backend
   *
   * TODO: Remplacer par vraie communication Supabase
   */
  private async syncToBackend(operation: SyncOperation): Promise<SyncResult> {
    // 🚧 STUB: Simulation pour tests sans backend
    // À remplacer par apiClient.sync(operation) quand Supabase sera prêt

    console.log(`[SyncHandler] 🚧 STUB: Simulating sync for operation ${operation.id} (${operation.type})`);

    // Simuler latence réseau
    await this.delay(500);

    // TODO: Implémenter switch selon operation.type
    // switch (operation.type) {
    //   case 'CREATE_SALE':
    //     return apiClient.sales.create(operation.payload);
    //   case 'UPDATE_PRODUCT':
    //     return apiClient.products.update(operation.payload.id, operation.payload);
    //   case 'CREATE_RETURN':
    //     return apiClient.returns.create(operation.payload);
    //   // ...
    // }

    // Pour l'instant, simuler un succès
    return {
      success: true,
      operationId: operation.id,
    };
  }

  /**
   * Enregistre un callback pour être notifié des erreurs
   */
  onError(callback: SyncErrorCallback): () => void {
    this.errorCallbacks.add(callback);

    // Retourner fonction de désinscription
    return () => {
      this.errorCallbacks.delete(callback);
    };
  }

  /**
   * Notifie tous les callbacks d'une erreur
   */
  private notifyError(operation: SyncOperation, error: string): void {
    this.errorCallbacks.forEach(callback => {
      try {
        callback(operation, error);
      } catch (err) {
        console.error('[SyncHandler] Error in error callback:', err);
      }
    });
  }

  /**
   * Utilitaire pour créer un délai
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Force le traitement immédiat de la queue (pour tests)
   */
  async forceSync(): Promise<void> {
    await this.processQueue();
  }

  /**
   * Retourne les statistiques de synchronisation
   */
  getStats() {
    return {
      isProcessing: this.isProcessing,
      queueStats: syncQueue.getStats(),
    };
  }
}

/**
 * Instance singleton du service
 */
export const syncHandler = new SyncHandlerService();
