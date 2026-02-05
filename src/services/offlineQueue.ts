// OfflineQueue.ts - Service de gestion de la queue de synchronisation offline
// Utilise IndexedDB pour persister les opérations localement

import type { SyncOperation, SyncOperationStatus, MutationType } from '../types/sync';

/**
 * Configuration IndexedDB
 */
const DB_NAME = 'bartender_offline_queue';
const DB_VERSION = 1;
const STORE_NAME = 'sync_operations';

/**
 * Service de gestion de la queue de synchronisation
 *
 * Responsabilités:
 * - Persister les opérations dans IndexedDB
 * - Gérer le CRUD des opérations
 * - Fournir des stats sur la queue
 *
 * Pattern: Singleton avec API asynchrone
 */
class OfflineQueue {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialise la base de données IndexedDB
   */
  private async initDB(): Promise<void> {
    if (this.db) return;

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('[OfflineQueue] Failed to open database:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[OfflineQueue] Database initialized');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Créer l'object store si nécessaire
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });

          // Index pour filtrer par statut
          store.createIndex('status', 'status', { unique: false });

          // Index pour filtrer par bar
          store.createIndex('barId', 'barId', { unique: false });

          // Index pour filtrer par timestamp
          store.createIndex('timestamp', 'timestamp', { unique: false });

          // Index composite pour queries avancées
          store.createIndex('barId_status', ['barId', 'status'], { unique: false });

          console.log('[OfflineQueue] Object store created');
        }
      };
    });

    return this.initPromise;
  }

  /**
   * Assure que la DB est initialisée
   */
  private async ensureDB(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.initDB();
    }
    if (!this.db) {
      throw new Error('[OfflineQueue] Database not initialized');
    }
    return this.db;
  }

  /**
   * Ajoute une opération à la queue
   */
  async addOperation(
    type: MutationType,
    payload: any,
    barId: string,
    userId: string
  ): Promise<SyncOperation> {
    const db = await this.ensureDB();

    const operation: SyncOperation = {
      id: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      payload,
      timestamp: Date.now(),
      retryCount: 0,
      status: 'pending',
      barId,
      userId,
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.add(operation);

      request.onsuccess = () => {
        console.log('[OfflineQueue] Operation added:', operation.id);
        // Déclencher événement pour mise à jour UI
        window.dispatchEvent(new CustomEvent('queue-updated'));
        resolve(operation);
      };

      request.onerror = () => {
        console.error('[OfflineQueue] Failed to add operation:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Récupère les opérations avec filtres optionnels
   */
  async getOperations(filters?: {
    status?: SyncOperationStatus;
    barId?: string;
  }): Promise<SyncOperation[]> {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);

      let request: IDBRequest;

      // Utiliser les index pour filtrage efficace
      if (filters?.barId && filters?.status) {
        const index = store.index('barId_status');
        request = index.getAll([filters.barId, filters.status]);
      } else if (filters?.status) {
        const index = store.index('status');
        request = index.getAll(filters.status);
      } else if (filters?.barId) {
        const index = store.index('barId');
        request = index.getAll(filters.barId);
      } else {
        request = store.getAll();
      }

      request.onsuccess = () => {
        const operations = request.result as SyncOperation[];
        // Trier par timestamp (plus ancien en premier)
        operations.sort((a, b) => a.timestamp - b.timestamp);
        resolve(operations);
      };

      request.onerror = () => {
        console.error('[OfflineQueue] Failed to get operations:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Récupère une opération par son ID
   */
  async getOperation(operationId: string): Promise<SyncOperation | null> {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(operationId);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        console.error('[OfflineQueue] Failed to get operation:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Met à jour le statut d'une opération
   */
  async updateOperationStatus(
    operationId: string,
    status: SyncOperationStatus,
    errorMessage?: string
  ): Promise<void> {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const getRequest = store.get(operationId);

      getRequest.onsuccess = () => {
        const operation = getRequest.result as SyncOperation | undefined;

        if (!operation) {
          reject(new Error(`Operation ${operationId} not found`));
          return;
        }

        // Mettre à jour l'opération
        operation.status = status;
        operation.lastAttemptAt = Date.now();

        if (status === 'syncing' || status === 'error') {
          operation.retryCount++;
        }

        if (errorMessage) {
          operation.errorMessage = errorMessage;
        }

        const putRequest = store.put(operation);

        putRequest.onsuccess = () => {
          console.log(`[OfflineQueue] Operation ${operationId} updated to ${status}`);
          // Déclencher événement pour mise à jour UI
          window.dispatchEvent(new CustomEvent('queue-updated'));
          resolve();
        };

        putRequest.onerror = () => {
          console.error('[OfflineQueue] Failed to update operation:', putRequest.error);
          reject(putRequest.error);
        };
      };

      getRequest.onerror = () => {
        console.error('[OfflineQueue] Failed to get operation:', getRequest.error);
        reject(getRequest.error);
      };
    });
  }

  /**
   * Supprime une opération de la queue
   */
  async removeOperation(operationId: string): Promise<void> {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(operationId);

      request.onsuccess = () => {
        console.log(`[OfflineQueue] Operation ${operationId} removed`);
        // Déclencher événement pour mise à jour UI
        window.dispatchEvent(new CustomEvent('queue-updated'));
        resolve();
      };

      request.onerror = () => {
        console.error('[OfflineQueue] Failed to remove operation:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Vide toute la queue (à utiliser avec précaution)
   */
  async clearQueue(barId?: string): Promise<void> {
    const db = await this.ensureDB();

    if (!barId) {
      // Vider toute la queue
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();

        request.onsuccess = () => {
          console.log('[OfflineQueue] Queue cleared');
          window.dispatchEvent(new CustomEvent('queue-updated'));
          resolve();
        };

        request.onerror = () => {
          console.error('[OfflineQueue] Failed to clear queue:', request.error);
          reject(request.error);
        };
      });
    }

    // Vider seulement pour un bar spécifique
    const operations = await this.getOperations({ barId });
    const promises = operations.map(op => this.removeOperation(op.id));
    await Promise.all(promises);
    console.log(`[OfflineQueue] Queue cleared for bar ${barId}`);
    window.dispatchEvent(new CustomEvent('queue-updated'));
  }

  /**
   * Récupère les statistiques de la queue
   */
  async getStats(barId?: string): Promise<{
    pendingCount: number;
    syncingCount: number;
    errorCount: number;
    totalCount: number;
  }> {
    const operations = await this.getOperations(barId ? { barId } : undefined);

    return {
      pendingCount: operations.filter(op => op.status === 'pending').length,
      syncingCount: operations.filter(op => op.status === 'syncing').length,
      errorCount: operations.filter(op => op.status === 'error').length,
      totalCount: operations.length,
    };
  }

  /**
   * Ferme la connexion à la base de données
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('[OfflineQueue] Database closed');
    }
  }
}

/**
 * Instance singleton du service
 */
export const offlineQueue = new OfflineQueue();