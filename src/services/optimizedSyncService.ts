// Service de synchronisation optimisé pour connexions lentes Bénin
import { indexedDBService } from './storage/IndexedDBService';

interface SyncStrategy {
  batchSize: number;
  delayBetweenBatches: number;
  maxRetries: number;
  priorityOrder: string[];
  enableCompression: boolean;
}

interface NetworkCondition {
  type: 'slow-2g' | '2g' | '3g' | '4g' | 'wifi';
  downlink: number;
  saveData: boolean;
  batteryLevel?: number;
}

class OptimizedSyncService {
  private syncQueue: any[] = [];
  private isSyncing = false;
  private syncStrategy: SyncStrategy;

  constructor() {
    this.syncStrategy = this.getDefaultStrategy();
  }

  // Stratégies adaptées aux conditions réseau Bénin
  private getStrategyForNetwork(condition: NetworkCondition): SyncStrategy {
    switch (condition.type) {
      case 'slow-2g':
        return {
          batchSize: 1,
          delayBetweenBatches: 5000,
          maxRetries: 2,
          priorityOrder: ['sales', 'stock', 'settings'],
          enableCompression: true
        };

      case '2g':
        return {
          batchSize: 2,
          delayBetweenBatches: 3000,
          maxRetries: 3,
          priorityOrder: ['sales', 'stock', 'inventory', 'settings'],
          enableCompression: true
        };

      case '3g':
        return {
          batchSize: 5,
          delayBetweenBatches: 1000,
          maxRetries: 3,
          priorityOrder: ['sales', 'stock', 'inventory', 'analytics', 'settings'],
          enableCompression: false
        };

      case '4g':
      case 'wifi':
      default:
        return {
          batchSize: 10,
          delayBetweenBatches: 500,
          maxRetries: 3,
          priorityOrder: ['sales', 'stock', 'inventory', 'analytics', 'reports', 'settings'],
          enableCompression: false
        };
    }
  }

  private getDefaultStrategy(): SyncStrategy {
    return {
      batchSize: 3,
      delayBetweenBatches: 2000,
      maxRetries: 3,
      priorityOrder: ['sales', 'stock', 'inventory', 'settings'],
      enableCompression: false
    };
  }

  // Adaptation automatique selon les conditions
  public adaptToNetworkConditions(condition: NetworkCondition) {
    const newStrategy = this.getStrategyForNetwork(condition);

    // Ajustements pour batterie faible
    if (condition.batteryLevel && condition.batteryLevel < 0.2) {
      newStrategy.batchSize = Math.min(newStrategy.batchSize, 2);
      newStrategy.delayBetweenBatches *= 2;
      newStrategy.maxRetries = Math.min(newStrategy.maxRetries, 2);
    }

    // Ajustements pour économie de données
    if (condition.saveData) {
      newStrategy.batchSize = Math.min(newStrategy.batchSize, 3);
      newStrategy.enableCompression = true;
      newStrategy.priorityOrder = ['sales', 'stock']; // Seulement l'essentiel
    }

    this.syncStrategy = newStrategy;
    console.log('[OptimizedSync] Stratégie adaptée:', newStrategy);
  }

  // Synchronisation intelligente avec priorités
  public async smartSync(networkCondition: NetworkCondition): Promise<void> {
    if (this.isSyncing) {
      console.log('[OptimizedSync] Synchronisation déjà en cours');
      return;
    }

    this.isSyncing = true;
    this.adaptToNetworkConditions(networkCondition);

    try {
      console.log('[OptimizedSync] Début de la synchronisation intelligente');

      // Récupérer les opérations en attente
      const pendingOps = await indexedDBService.getPendingSyncOperations();

      if (pendingOps.length === 0) {
        console.log('[OptimizedSync] Aucune opération en attente');
        return;
      }

      // Trier par priorité selon la stratégie
      const sortedOps = this.sortByPriority(pendingOps);

      // Traiter par batches
      await this.processBatches(sortedOps, networkCondition);

      console.log('[OptimizedSync] Synchronisation terminée avec succès');

    } catch (error) {
      console.error('[OptimizedSync] Erreur de synchronisation:', error);

      // En cas d'échec, programmer une nouvelle tentative
      this.scheduleRetry(networkCondition);

    } finally {
      this.isSyncing = false;
    }
  }

  private sortByPriority(operations: any[]): any[] {
    const priorityMap = this.syncStrategy.priorityOrder.reduce((map, entity, index) => {
      map[entity] = index;
      return map;
    }, {} as Record<string, number>);

    return operations.sort((a, b) => {
      const aPriority = priorityMap[a.entity] ?? 999;
      const bPriority = priorityMap[b.entity] ?? 999;

      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }

      // Si même priorité, trier par timestamp
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    });
  }

  private async processBatches(operations: any[], networkCondition: NetworkCondition): Promise<void> {
    const { batchSize, delayBetweenBatches } = this.syncStrategy;

    for (let i = 0; i < operations.length; i += batchSize) {
      const batch = operations.slice(i, i + batchSize);

      console.log(`[OptimizedSync] Traitement batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(operations.length / batchSize)}`);

      // Traiter les opérations du batch en parallèle
      const batchPromises = batch.map(op => this.processSingleOperation(op, networkCondition));

      try {
        await Promise.allSettled(batchPromises);
      } catch (error) {
        console.warn('[OptimizedSync] Erreur dans le batch, continue avec le suivant:', error);
      }

      // Délai entre les batches pour ne pas surcharger
      if (i + batchSize < operations.length) {
        await this.delay(delayBetweenBatches);
      }

      // Vérifier si on doit arrêter (batterie critique, connexion perdue)
      if (this.shouldStopSync(networkCondition)) {
        console.log('[OptimizedSync] Arrêt de la sync pour préserver les ressources');
        break;
      }
    }
  }

  private async processSingleOperation(operation: any, networkCondition: NetworkCondition): Promise<void> {
    const { maxRetries } = this.syncStrategy;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Simuler l'envoi au serveur (à remplacer par vraie API)
        await this.sendToServer(operation, networkCondition);

        // Marquer comme complété
        await indexedDBService.markSyncOperationCompleted(operation.id);

        console.log(`[OptimizedSync] Opération ${operation.id} synchronisée`);
        return;

      } catch (error) {
        console.warn(`[OptimizedSync] Tentative ${attempt + 1}/${maxRetries} échouée pour ${operation.id}:`, error);

        if (attempt < maxRetries - 1) {
          // Délai exponentiel entre les tentatives
          await this.delay(1000 * Math.pow(2, attempt));
        }
      }
    }

    // Toutes les tentatives ont échoué
    await indexedDBService.incrementSyncRetry(operation.id);
    console.error(`[OptimizedSync] Échec définitif pour ${operation.id}`);
  }

  private async sendToServer(operation: any, networkCondition: NetworkCondition): Promise<void> {
    let payload = operation.data;

    // Compression pour connexions lentes
    if (this.syncStrategy.enableCompression) {
      payload = this.compressData(payload);
    }

    // Simuler l'appel API (à remplacer par le vrai service)
    const timeout = networkCondition.type === 'slow-2g' ? 30000 : 10000;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Sync-Priority': operation.priority,
          'X-Network-Type': networkCondition.type
        },
        body: JSON.stringify({
          operation: operation.type,
          entity: operation.entity,
          data: payload,
          timestamp: operation.timestamp
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log(`[OptimizedSync] Réponse serveur pour ${operation.id}:`, result);

    } finally {
      clearTimeout(timeoutId);
    }
  }

  private compressData(data: any): any {
    // Compression simple : supprimer les champs optionnels
    if (typeof data === 'object' && data !== null) {
      const compressed = { ...data };

      // Supprimer les métadonnées non critiques
      delete compressed.createdAt;
      delete compressed.updatedAt;
      delete compressed.metadata;

      return compressed;
    }

    return data;
  }

  private shouldStopSync(networkCondition: NetworkCondition): boolean {
    // Arrêter si batterie critique
    if (networkCondition.batteryLevel && networkCondition.batteryLevel < 0.1) {
      return true;
    }

    // Arrêter si connexion devenue très lente
    if (networkCondition.type === 'slow-2g' && networkCondition.downlink < 0.1) {
      return true;
    }

    return false;
  }

  private scheduleRetry(networkCondition: NetworkCondition): void {
    const retryDelay = networkCondition.type === 'slow-2g' ? 300000 : 60000; // 5 min vs 1 min

    setTimeout(() => {
      if (!this.isSyncing) {
        this.smartSync(networkCondition);
      }
    }, retryDelay);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Méthodes publiques pour l'interface
  public async syncSalesOnly(networkCondition: NetworkCondition): Promise<void> {
    const originalStrategy = { ...this.syncStrategy };
    this.syncStrategy.priorityOrder = ['sales'];

    try {
      await this.smartSync(networkCondition);
    } finally {
      this.syncStrategy = originalStrategy;
    }
  }

  public async syncCriticalOnly(networkCondition: NetworkCondition): Promise<void> {
    const originalStrategy = { ...this.syncStrategy };
    this.syncStrategy.priorityOrder = ['sales', 'stock'];
    this.syncStrategy.batchSize = 1;

    try {
      await this.smartSync(networkCondition);
    } finally {
      this.syncStrategy = originalStrategy;
    }
  }

  public getQueueSize(): Promise<number> {
    return indexedDBService.getPendingSyncOperations().then(ops => ops.length);
  }

  public clearQueue(): Promise<void> {
    // Implémenter si nécessaire
    return Promise.resolve();
  }
}

// Export singleton
export const optimizedSyncService = new OptimizedSyncService();