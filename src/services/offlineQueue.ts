// OfflineQueue.ts - Service de gestion de la queue de synchronisation offline
// Utilise IndexedDB pour persister les opérations localement

import type { SyncOperation, SyncOperationStatus, MutationType } from '../types/sync';
import { MutationSchemas } from '../types/schemas';

/**
 * Configuration IndexedDB
 */
const DB_NAME = 'bartender_offline_queue';
const DB_VERSION = 3; // UPGRADE: v2 -> v3 (Phase Hardening : Locks & Transition Persistante)
const STORE_NAME = 'sync_operations';
const TRANSLATIONS_STORE = 'id_translations';
const TRANSITIONAL_STORE = 'transitional_syncs'; // NEW: Store pour buffer anti-flash persistant

/**
 * Service de gestion de la queue de synchronisation
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
      const timeoutId = setTimeout(() => {
        console.error('[OfflineQueue] IndexedDB open timed out (5s)');
        reject(new Error('IDB_OPEN_TIMEOUT'));
      }, 5000);

      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
          clearTimeout(timeoutId);
          console.error('[OfflineQueue] Failed to open database:', request.error);
          reject(request.error);
        };

        request.onsuccess = () => {
          clearTimeout(timeoutId);
          this.db = request.result;
          console.log('[OfflineQueue] Database initialized');
          resolve();
        };

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;

          // Store principal des opérations
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            store.createIndex('status', 'status', { unique: false });
            store.createIndex('barId', 'barId', { unique: false });
            store.createIndex('timestamp', 'timestamp', { unique: false });
            store.createIndex('barId_status', ['barId', 'status'], { unique: false });
            console.log('[OfflineQueue] sync_operations store created');
          }

          // Store des traductions d'IDs (v2)
          if (!db.objectStoreNames.contains(TRANSLATIONS_STORE)) {
            const translationStore = db.createObjectStore(TRANSLATIONS_STORE, { keyPath: 'tempId' });
            translationStore.createIndex('timestamp', 'timestamp', { unique: false });
            console.log('[OfflineQueue] id_translations store created');
          }

          // Store du tampon de transition anti-flash (v3)
          if (!db.objectStoreNames.contains(TRANSITIONAL_STORE)) {
            const transitionStore = db.createObjectStore(TRANSITIONAL_STORE, { keyPath: 'idempotencyKey' });
            transitionStore.createIndex('timestamp', 'timestamp', { unique: false });
            console.log('[OfflineQueue] transitional_syncs store created');
          }
        };
      } catch (err) {
        clearTimeout(timeoutId);
        reject(err);
      }
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
  async addOperation<T extends MutationType>(
    type: T,
    payload: Extract<SyncOperation, { type: T }>['payload'],
    barId: string,
    userId: string
  ): Promise<SyncOperation> {
    // 🛡️ RUNTIME VALIDATION (Phase 16 : Blindage Expert)
    const schema = MutationSchemas[type];
    if (schema) {
      try {
        schema.parse(payload);
      } catch (err) {
        const errors = typeof err === 'object' && err !== null && 'errors' in err
          ? err.errors
          : err;
        console.error(`[OfflineQueue] Validation failed for ${type}:`, errors);
        throw new Error(`INVALID_PAYLOAD: ${type}`);
      }
    }

    const db = await this.ensureDB();

    const operation = {
      id: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      payload,
      timestamp: Date.now(),
      retryCount: 0,
      status: 'pending',
      barId,
      userId,
    } as SyncOperation;

    return new Promise((resolve, reject) => {
      const execAdd = () => {
        try {
          const transaction = db.transaction([STORE_NAME], 'readwrite');
          const store = transaction.objectStore(STORE_NAME);
          const request = store.add(operation);

          request.onsuccess = () => {
            console.log('[OfflineQueue] Operation added:', operation.id);
            window.dispatchEvent(new CustomEvent('queue-updated'));
            resolve(operation);
          };

          request.onerror = async () => {
            const error = request.error;
            // 🛡️ Quota Protection (Sprint 1): Nettoyage automatique si IDB plein
            if (error?.name === 'QuotaExceededError') {
              console.warn('[OfflineQueue] Quota exceeded, cleaning up old operations...');
              try {
                const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
                const allOps = await this.getOperations();
                const oldOps = allOps.filter(op => op.timestamp < sevenDaysAgo);

                for (const op of oldOps) {
                  await this.removeOperation(op.id);
                }

                // Réessayer une seule fois
                execAdd();
                return;
              } catch (cleanupErr) {
                reject(cleanupErr);
                return;
              }
            }
            console.error('[OfflineQueue] Failed to add operation:', error);
            reject(error);
          };
        } catch (err) {
          reject(err);
        }
      };

      execAdd();
    });
  }

  async getOperations(filters?: {
    status?: SyncOperationStatus;
    barId?: string;
  }): Promise<SyncOperation[]> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      let request: IDBRequest;

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
        operations.sort((a, b) => a.timestamp - b.timestamp);
        resolve(operations);
      };

      request.onerror = () => reject(request.error);
    });
  }

  async getOperation(operationId: string): Promise<SyncOperation | null> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(operationId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

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
          window.dispatchEvent(new CustomEvent('queue-updated'));
          resolve();
        };
        putRequest.onerror = () => reject(putRequest.error);
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async resetRetries(operationId: string): Promise<void> {
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
        operation.retryCount = 0;
        operation.status = 'pending';
        const putRequest = store.put(operation);
        putRequest.onsuccess = () => {
          window.dispatchEvent(new CustomEvent('queue-updated'));
          resolve();
        };
        putRequest.onerror = () => reject(putRequest.error);
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async removeOperation(operationId: string): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(operationId);
      request.onsuccess = () => {
        window.dispatchEvent(new CustomEvent('queue-updated'));
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  async clearQueue(barId?: string): Promise<void> {
    const db = await this.ensureDB();
    if (!barId) {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();
        request.onsuccess = () => {
          window.dispatchEvent(new CustomEvent('queue-updated'));
          resolve();
        };
        request.onerror = () => reject(request.error);
      });
    }
    const operations = await this.getOperations({ barId });
    await Promise.all(operations.map(op => this.removeOperation(op.id)));
  }

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

  // --- ID TRANSLATIONS (Phase 13 Blindage) ---

  async saveIdTranslation(tempId: string, realId: string): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([TRANSLATIONS_STORE], 'readwrite');
      const store = transaction.objectStore(TRANSLATIONS_STORE);
      const request = store.put({
        tempId,
        realId,
        timestamp: Date.now()
      });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getIdTranslations(): Promise<Map<string, string>> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([TRANSLATIONS_STORE], 'readonly');
      const store = transaction.objectStore(TRANSLATIONS_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        const results = request.result as Array<{ tempId: string; realId: string }>;
        const map = new Map<string, string>();
        results.forEach(item => map.set(item.tempId, item.realId));
        resolve(map);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async clearIdTranslations(): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([TRANSLATIONS_STORE], 'readwrite');
      const store = transaction.objectStore(TRANSLATIONS_STORE);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // --- TRANSITIONAL SYNCS (Hardening Pillar 4) ---

  /**
   * Ajoute une vente au tampon de transition persistant
   */
  async addTransitionalSync(idempotencyKey: string, data: { total: number, payload: any }): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([TRANSITIONAL_STORE], 'readwrite');
      const store = transaction.objectStore(TRANSITIONAL_STORE);
      const request = store.put({
        idempotencyKey,
        total: data.total,
        payload: data.payload,
        timestamp: Date.now()
      });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Récupère toutes les clés de transition actives
   */
  async getTransitionalSyncs(): Promise<Map<string, { total: number, timestamp: number, payload: any }>> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([TRANSITIONAL_STORE], 'readonly');
      const store = transaction.objectStore(TRANSITIONAL_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        const results = request.result as Array<{
          idempotencyKey: string;
          total: number;
          timestamp: number;
          payload: any
        }>;
        const map = new Map();
        results.forEach(item => {
          map.set(item.idempotencyKey, {
            total: item.total,
            timestamp: item.timestamp,
            payload: item.payload
          });
        });
        resolve(map);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Supprime une clé de transition spécifique
   */
  async removeTransitionalSync(idempotencyKey: string): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([TRANSITIONAL_STORE], 'readwrite');
      const store = transaction.objectStore(TRANSITIONAL_STORE);
      const request = store.delete(idempotencyKey);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Nettoie les clés de transition datant de plus de X minutes
   */
  async cleanupTransitionalSyncs(ttlMs: number = 10 * 60 * 1000): Promise<number> {
    const db = await this.ensureDB();
    const threshold = Date.now() - ttlMs;

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([TRANSITIONAL_STORE], 'readwrite');
      const store = transaction.objectStore(TRANSITIONAL_STORE);
      const index = store.index('timestamp');
      const range = IDBKeyRange.upperBound(threshold);
      const request = index.openCursor(range);
      let count = 0;

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          cursor.delete();
          count++;
          cursor.continue();
        } else {
          resolve(count);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

export const offlineQueue = new OfflineQueue();