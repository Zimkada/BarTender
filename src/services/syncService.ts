import { offlineQueue, QueuedOperation } from './offlineQueue';


class SyncService {
  private isSyncing = false;
  private syncInterval: number | null = null;

  // Démarrer la synchronisation automatique
  startAutoSync() {
    // Vérifier toutes les 30 secondes si en ligne
    this.syncInterval = window.setInterval(() => {
      if (navigator.onLine && !this.isSyncing) {
        this.syncPendingOperations();
      }
    }, 30000);

    // Sync immédiate si en ligne
    if (navigator.onLine) {
      this.syncPendingOperations();
    }
  }

  // Arrêter la synchronisation
  stopAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  // Synchroniser les opérations en attente
  async syncPendingOperations() {
    if (this.isSyncing) return;

    const operations = offlineQueue.getAll();
    if (operations.length === 0) return;

    this.isSyncing = true;
    console.log(`Synchronisation de ${operations.length} opérations...`);

    for (const operation of operations) {
      try {
        await this.processOperation(operation);
        offlineQueue.remove(operation.id);
      } catch (error) {
        console.error('Erreur sync:', error);
        
        // Si max retries atteint, supprimer
        if (!offlineQueue.incrementRetries(operation.id)) {
          offlineQueue.remove(operation.id);
          window.dispatchEvent(new CustomEvent('sync-failed', { 
            detail: { operation, error } 
          }));
        }
      }
    }

    this.isSyncing = false;
    window.dispatchEvent(new Event('sync-completed'));
  }

  // Traiter une opération
  private async processOperation(operation: QueuedOperation): Promise<void> {
    // Pour l'instant, on simule juste un délai
    // Plus tard, ce sera l'appel à Supabase
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log('Opération synchronisée:', operation.type);
  }
}

export const syncService = new SyncService();