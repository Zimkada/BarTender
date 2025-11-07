// SyncQueue.ts - Queue persistante pour synchronisation offline/online
// Architecture: FIFO avec retry automatique et backoff exponentiel

import type {
  SyncOperation,
  SyncOperationStatus,
  MutationType,
  RetryConfig,
} from '../types/sync';
import { DEFAULT_RETRY_CONFIG } from '../types/sync';

/**
 * Clé localStorage pour la queue de synchronisation
 */
const SYNC_QUEUE_KEY = 'sync-queue-v1';

/**
 * Type de callback pour les listeners
 */
type QueueChangeListener = (queue: SyncOperation[]) => void;

/**
 * Service de gestion de la queue de synchronisation
 *
 * Responsabilités:
 * - Persister les opérations dans localStorage
 * - Garantir l'ordre FIFO
 * - Gérer les retry avec backoff exponentiel
 * - Notifier les listeners des changements
 *
 * Pattern: Singleton avec pub/sub pour réactivité
 */
class SyncQueueService {
  private queue: SyncOperation[] = [];
  private listeners: Set<QueueChangeListener> = new Set();
  private retryConfig: RetryConfig;

  constructor(config?: Partial<RetryConfig>) {
    this.retryConfig = {
      ...DEFAULT_RETRY_CONFIG,
      ...config,
    };
    this.loadFromStorage();
  }

  /**
   * Charge la queue depuis localStorage
   */
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(SYNC_QUEUE_KEY);
      if (stored) {
        this.queue = JSON.parse(stored);
        console.log(`[SyncQueue] Loaded ${this.queue.length} operations from storage`);
      }
    } catch (error) {
      console.error('[SyncQueue] Error loading from storage:', error);
      this.queue = [];
    }
  }

  /**
   * Sauvegarde la queue dans localStorage
   */
  private saveToStorage(): void {
    try {
      localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(this.queue));
    } catch (error) {
      console.error('[SyncQueue] Error saving to storage:', error);
    }
  }

  /**
   * Notifie tous les listeners d'un changement
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => listener([...this.queue]));
  }

  /**
   * Génère un ID unique pour une opération
   */
  private generateOperationId(): string {
    return `sync_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Ajoute une opération à la queue
   *
   * @param type - Type de mutation
   * @param payload - Données de l'opération
   * @param barId - ID du bar concerné
   * @param userId - ID de l'utilisateur
   * @returns L'opération créée
   */
  enqueue(
    type: MutationType,
    payload: any,
    barId: string,
    userId: string
  ): SyncOperation {
    const operation: SyncOperation = {
      id: this.generateOperationId(),
      type,
      payload,
      timestamp: Date.now(),
      retryCount: 0,
      status: 'pending',
      barId,
      userId,
    };

    this.queue.push(operation);
    this.saveToStorage();
    this.notifyListeners();

    console.log(`[SyncQueue] Enqueued operation: ${type} (id: ${operation.id})`);
    return operation;
  }

  /**
   * Récupère la prochaine opération à synchroniser
   * Ne retire PAS l'opération de la queue (utiliser markAsSuccess ou markAsError)
   *
   * @returns La prochaine opération pending, ou null si vide
   */
  peek(): SyncOperation | null {
    return this.queue.find(op => op.status === 'pending') || null;
  }

  /**
   * Récupère toutes les opérations pending
   */
  getPending(): SyncOperation[] {
    return this.queue.filter(op => op.status === 'pending');
  }

  /**
   * Récupère toutes les opérations en erreur
   */
  getErrors(): SyncOperation[] {
    return this.queue.filter(op => op.status === 'error');
  }

  /**
   * Marque une opération comme en cours de sync
   */
  markAsSyncing(operationId: string): void {
    const operation = this.queue.find(op => op.id === operationId);
    if (operation) {
      operation.status = 'syncing';
      operation.lastAttemptAt = Date.now();
      this.saveToStorage();
      this.notifyListeners();
    }
  }

  /**
   * Marque une opération comme réussie et la retire de la queue
   */
  markAsSuccess(operationId: string): void {
    const index = this.queue.findIndex(op => op.id === operationId);
    if (index !== -1) {
      console.log(`[SyncQueue] Operation ${operationId} succeeded, removing from queue`);
      this.queue.splice(index, 1);
      this.saveToStorage();
      this.notifyListeners();
    }
  }

  /**
   * Marque une opération comme en erreur et planifie retry si possible
   *
   * @param operationId - ID de l'opération
   * @param errorMessage - Message d'erreur
   * @param shouldRetry - L'erreur est-elle temporaire (retry possible)
   */
  markAsError(
    operationId: string,
    errorMessage: string,
    shouldRetry: boolean = true
  ): void {
    const operation = this.queue.find(op => op.id === operationId);
    if (!operation) return;

    operation.errorMessage = errorMessage;
    operation.retryCount++;

    // Si retry possible et pas encore max retries, remettre en pending
    if (shouldRetry && operation.retryCount < this.retryConfig.maxRetries) {
      operation.status = 'pending';
      console.log(
        `[SyncQueue] Operation ${operationId} failed (${operation.retryCount}/${this.retryConfig.maxRetries}), will retry`
      );
    } else {
      operation.status = 'error';
      console.error(
        `[SyncQueue] Operation ${operationId} permanently failed: ${errorMessage}`
      );
    }

    this.saveToStorage();
    this.notifyListeners();
  }

  /**
   * Calcule le délai avant la prochaine tentative (backoff exponentiel)
   *
   * @param retryCount - Nombre de tentatives déjà effectuées
   * @returns Délai en millisecondes
   */
  getRetryDelay(retryCount: number): number {
    const delay = this.retryConfig.initialDelay * Math.pow(this.retryConfig.backoffFactor, retryCount);
    return Math.min(delay, this.retryConfig.maxDelay);
  }

  /**
   * Réinitialise une opération en erreur pour la réessayer
   */
  retryOperation(operationId: string): void {
    const operation = this.queue.find(op => op.id === operationId);
    if (operation && operation.status === 'error') {
      operation.status = 'pending';
      operation.retryCount = 0;
      operation.errorMessage = undefined;
      this.saveToStorage();
      this.notifyListeners();
      console.log(`[SyncQueue] Operation ${operationId} reset for retry`);
    }
  }

  /**
   * Réessaye toutes les opérations en erreur
   */
  retryAll(): void {
    let retried = 0;
    this.queue.forEach(operation => {
      if (operation.status === 'error') {
        operation.status = 'pending';
        operation.retryCount = 0;
        operation.errorMessage = undefined;
        retried++;
      }
    });

    if (retried > 0) {
      this.saveToStorage();
      this.notifyListeners();
      console.log(`[SyncQueue] Reset ${retried} operations for retry`);
    }
  }

  /**
   * Supprime une opération spécifique de la queue
   */
  remove(operationId: string): void {
    const index = this.queue.findIndex(op => op.id === operationId);
    if (index !== -1) {
      this.queue.splice(index, 1);
      this.saveToStorage();
      this.notifyListeners();
      console.log(`[SyncQueue] Removed operation ${operationId}`);
    }
  }

  /**
   * Vide complètement la queue (DANGER: perte de données)
   */
  clear(): void {
    const count = this.queue.length;
    this.queue = [];
    this.saveToStorage();
    this.notifyListeners();
    console.warn(`[SyncQueue] Cleared ${count} operations from queue`);
  }

  /**
   * Récupère toute la queue (copie pour sécurité)
   */
  getAll(): SyncOperation[] {
    return [...this.queue];
  }

  /**
   * Récupère le nombre d'opérations par statut
   */
  getStats() {
    return {
      total: this.queue.length,
      pending: this.queue.filter(op => op.status === 'pending').length,
      syncing: this.queue.filter(op => op.status === 'syncing').length,
      error: this.queue.filter(op => op.status === 'error').length,
    };
  }

  /**
   * S'abonne aux changements de la queue
   *
   * @param listener - Fonction appelée à chaque changement
   * @returns Fonction pour se désabonner
   */
  subscribe(listener: QueueChangeListener): () => void {
    this.listeners.add(listener);
    // Notifier immédiatement avec l'état actuel
    listener([...this.queue]);

    // Retourner fonction de désabonnement
    return () => {
      this.listeners.delete(listener);
    };
  }
}

/**
 * Instance singleton du service
 */
export const syncQueue = new SyncQueueService();
