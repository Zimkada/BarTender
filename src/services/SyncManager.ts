// SyncManager.ts - Gestion de la synchronisation automatique offline → online
// Orchestre la synchronisation des opérations en queue lors du retour de connexion

import type { SyncOperation, SyncResult, RetryConfig } from '../types/sync';
import { DEFAULT_RETRY_CONFIG } from '../types/sync';
import { networkManager } from './NetworkManager';
import { offlineQueue } from './offlineQueue';
import { supabase } from '../lib/supabase';
import { BarsService } from './supabase/bars.service';
import { broadcastService } from './broadcast/BroadcastService';

/**
 * Service de gestion de la synchronisation automatique
 *
 * Responsabilités:
 * - Écouter les changements de statut réseau
 * - Déclencher la synchronisation automatiquement au retour online
 * - Gérer les retries avec backoff exponentiel
 * - Mettre à jour les statuts des opérations
 * - Notifier les composants UI des changements
 *
 * Pattern: Singleton avec pub/sub
 */
class SyncManagerService {
  private isSyncing = false;
  private networkUnsubscribe: (() => void) | null = null;
  private retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG;
  private timers: Map<string, NodeJS.Timeout> = new Map();

  /**
   * 🛡️ Tampon de sécurité (Phase 8) : 
   * Stocke les clés d'idempotence des ventes tout juste synchronisées
   * pour éviter le "Trou de CA" (Flash) avant que le serveur n'indexe.
   */
  private recentlySyncedKeys: Set<string> = new Set();

  /**
   * Récupère les clés récemment synchronisées (pour dédoublonnage UI)
   */
  getRecentlySyncedKeys(): Set<string> {
    return new Set(this.recentlySyncedKeys);
  }

  /**
   * Initialise le service et s'abonne aux changements réseau
   */
  init(): void {
    console.log('[SyncManager] Initializing...');

    // S'abonner aux changements de statut réseau
    this.networkUnsubscribe = networkManager.subscribe((status) => {
      console.log('[SyncManager] Network status changed:', status);

      // Si on revient online, déclencher la synchronisation
      if (status === 'online' && !this.isSyncing) {
        this.syncAll();
      }
    });

    console.log('[SyncManager] Initialized');
  }

  /**
   * Nettoie les abonnements
   */
  cleanup(): void {
    // 🛡️ Clear tous les timers actifs (Anti-Memory Leak)
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();

    if (this.networkUnsubscribe) {
      this.networkUnsubscribe();
      this.networkUnsubscribe = null;
    }
    console.log('[SyncManager] Cleaned up with timers cleared');
  }

  /**
   * Synchronise toutes les opérations en attente
   */
  async syncAll(): Promise<void> {
    if (this.isSyncing) {
      console.log('[SyncManager] Sync already in progress, skipping');
      return;
    }

    if (!networkManager.isOnline()) {
      console.log('[SyncManager] Cannot sync while offline');
      return;
    }

    this.isSyncing = true;
    console.log('[SyncManager] Starting sync...');

    try {
      // Récupérer toutes les opérations pending et error
      const pendingOps = await offlineQueue.getOperations({ status: 'pending' });
      const errorOps = await offlineQueue.getOperations({ status: 'error' });
      const allOps = [...pendingOps, ...errorOps];

      console.log(`[SyncManager] Found ${allOps.length} operations to sync`);

      if (allOps.length === 0) {
        console.log('[SyncManager] No operations to sync');
        return;
      }

      // 🛡️ Lock Token (Sprint 1): Vérifier/Rafraîchir la session avant de commencer
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        console.warn('[SyncManager] Invalid session, attempting refresh...');
        const { error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) {
          console.error('[SyncManager] Session refresh failed, sync aborted');
          return;
        }
      }

      // Synchroniser chaque opération séquentiellement
      for (const operation of allOps) {
        await this.syncOperation(operation);
      }

      console.log('[SyncManager] Sync completed');

      // 🚀 Coup de Sifflet : Notifier que la sync est finie pour rafraîchir les UI
      window.dispatchEvent(new CustomEvent('sync-completed'));

    } catch (error) {
      console.error('[SyncManager] Sync failed:', error);
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Synchronise une opération spécifique
   */
  private async syncOperation(operation: SyncOperation): Promise<void> {
    console.log(`[SyncManager] Syncing operation ${operation.id} (${operation.type})`);

    // Vérifier si on a dépassé le nombre maximum de retries
    if (operation.retryCount >= this.retryConfig.maxRetries) {
      console.warn(`[SyncManager] Operation ${operation.id} exceeded max retries, skipping`);
      return;
    }

    // Marquer comme en cours de synchronisation
    await offlineQueue.updateOperationStatus(operation.id, 'syncing');

    try {
      // Synchroniser selon le type d'opération
      const result = await this.syncByType(operation);

      if (result.success) {
        // Succès: marquer comme success et supprimer de la queue
        await offlineQueue.updateOperationStatus(operation.id, 'success');

        // 🛡️ Lock Flash (Phase 8): Alimenter la zone tampon (10s)
        // Cette logique est spécifique à CREATE_SALE, mais l'idempotency_key est sur l'opération
        // On l'ajoute ici pour être générique, mais elle ne sera présente que pour CREATE_SALE
        const idempotencyKey = operation.payload.idempotency_key;
        if (idempotencyKey) {
          this.recentlySyncedKeys.add(idempotencyKey);

          // Clear previous timer for this key if it exists
          if (this.timers.has(idempotencyKey)) {
            clearTimeout(this.timers.get(idempotencyKey)!);
          }

          const timerId = setTimeout(() => {
            this.recentlySyncedKeys.delete(idempotencyKey);
            this.timers.delete(idempotencyKey);
          }, 10000);

          this.timers.set(idempotencyKey, timerId);
        }

        await offlineQueue.removeOperation(operation.id);
        console.log(`[SyncManager] Operation ${operation.id} synced successfully`);
      } else {
        // Échec: marquer comme error et planifier retry si applicable
        await offlineQueue.updateOperationStatus(
          operation.id,
          'error',
          result.error || 'Unknown error'
        );

        if (result.shouldRetry) {
          console.warn(`[SyncManager] Operation ${operation.id} failed, will retry later`);
          // Le retry sera géré au prochain cycle de sync
        } else {
          console.error(`[SyncManager] Operation ${operation.id} failed permanently:`, result.error);
        }
      }
    } catch (error: any) {
      console.error(`[SyncManager] Exception syncing operation ${operation.id}:`, error);
      await offlineQueue.updateOperationStatus(
        operation.id,
        'error',
        error.message || 'Sync exception'
      );
    }
  }

  /**
   * Synchronise une opération selon son type
   */
  private async syncByType(operation: SyncOperation): Promise<SyncResult> {
    switch (operation.type) {
      case 'CREATE_SALE':
        return this.syncCreateSale(operation);

      case 'UPDATE_BAR':
        return this.syncUpdateBar(operation);

      // TODO: Ajouter d'autres types d'opérations ici
      // case 'UPDATE_PRODUCT':
      //   return this.syncUpdateProduct(operation);
      // case 'CREATE_RETURN':
      //   return this.syncCreateReturn(operation);

      default:
        console.warn(`[SyncManager] Unknown operation type: ${operation.type}`);
        return {
          success: false,
          operationId: operation.id,
          error: `Unknown operation type: ${operation.type}`,
          shouldRetry: false,
        };
    }
  }

  /**
   * Synchronise une vente créée offline
   */
  private async syncCreateSale(operation: SyncOperation): Promise<SyncResult> {
    try {
      const payload = operation.payload;

      // Appeler le RPC idempotent pour créer la vente
      const { data, error } = await supabase.rpc('create_sale_idempotent' as any, {
        p_bar_id: payload.bar_id,
        p_items: payload.items,
        p_payment_method: payload.payment_method,
        p_sold_by: payload.sold_by,
        p_idempotency_key: payload.idempotency_key,
        p_server_id: payload.server_id || null,
        p_status: payload.status || 'validated',
        p_customer_name: payload.customer_name || null,
        p_customer_phone: payload.customer_phone || null,
        p_notes: payload.notes || null,
        p_business_date: payload.business_date || null,
      }).single();

      if (error) {
        console.error(`[SyncManager] RPC error for operation ${operation.id}:`, error);

        // Déterminer si on doit retry selon le code d'erreur
        const shouldRetry = this.shouldRetryError(error);

        return {
          success: false,
          operationId: operation.id,
          error: error.message || error.code,
          shouldRetry,
        };
      }

      console.log(`[SyncManager] Sale created successfully: ${(data as any).id}`);

      // 🚀 Broadcast aux autres onglets pour mise à jour immédiate
      if (broadcastService.isSupported()) {
        broadcastService.broadcast({
          event: 'INSERT',
          table: 'sales',
          barId: payload.bar_id,
          data: data, // La vente complète retournée par RPC
        });

        // Notifier aussi le changement de stock
        broadcastService.broadcast({
          event: 'UPDATE',
          table: 'bar_products',
          barId: payload.bar_id,
        });
      }

      return {
        success: true,
        operationId: operation.id,
      };
    } catch (error: any) {
      console.error(`[SyncManager] Exception creating sale:`, error);
      return {
        success: false,
        operationId: operation.id,
        error: error.message || 'Unknown exception',
        shouldRetry: true, // Retry par défaut sur exception
      };
    }
  }

  /**
   * Synchronise une mise à jour de bar (Settings)
   */
  private async syncUpdateBar(operation: SyncOperation): Promise<SyncResult> {
    try {
      const payload = operation.payload;
      const { barId, updates } = payload;

      if (!barId || !updates) {
        return {
          success: false,
          operationId: operation.id,
          error: 'Missing barId or updates in payload',
          shouldRetry: false
        };
      }

      console.log(`[SyncManager] Syncing bar update for ${barId}`, updates);

      // 🛡️ Conflict Detection (Sprint 2): Vérifier si le serveur a été mis à jour après cette opération
      const { data: currentBar, error: fetchError } = await supabase
        .from('bars')
        .select('updated_at')
        .eq('id', barId)
        .single();

      if (!fetchError && currentBar?.updated_at) {
        const serverUpdateTime = new Date(currentBar.updated_at).getTime();
        if (serverUpdateTime > operation.timestamp) {
          console.warn(`[SyncManager] Conflict detected for bar ${barId}. Server: ${currentBar.updated_at} > Local: ${new Date(operation.timestamp).toISOString()}`);
          return {
            success: false,
            operationId: operation.id,
            error: 'CONFLICT_DETECTED',
            shouldRetry: false // Résolution manuelle requise
          };
        }
      }

      // Mapper les updates (camelCase Partial<Bar>) vers le format Supabase (snake_case)
      // Car BarContext a stocké les updates bruts
      const supabaseUpdates: any = {};
      if (updates.name) supabaseUpdates.name = updates.name;
      if (updates.address) supabaseUpdates.address = updates.address;
      if (updates.phone) supabaseUpdates.phone = updates.phone;
      if (updates.settings) supabaseUpdates.settings = updates.settings;
      if (updates.isActive !== undefined) supabaseUpdates.is_active = updates.isActive;
      if (updates.closingHour !== undefined) supabaseUpdates.closing_hour = updates.closingHour;
      if (updates.theme_config !== undefined) supabaseUpdates.theme_config = updates.theme_config;

      // Utiliser BarsService pour effectuer la mise à jour
      await BarsService.updateBar(barId, supabaseUpdates);

      console.log(`[SyncManager] Bar updated successfully: ${barId}`);

      // 🚀 Broadcast aux autres onglets
      if (broadcastService.isSupported()) {
        broadcastService.broadcast({
          event: 'UPDATE',
          table: 'bars',
          barId: barId,
          data: { id: barId, ...supabaseUpdates }
        });
      }

      return {
        success: true,
        operationId: operation.id,
      };

    } catch (error: any) {
      console.error(`[SyncManager] Exception updating bar:`, error);

      const shouldRetry = this.shouldRetryError(error);

      return {
        success: false,
        operationId: operation.id,
        error: error.message || 'Unknown exception',
        shouldRetry: shouldRetry,
      };
    }
  }

  /**
   * Détermine si une erreur est temporaire et mérite un retry
   */
  private shouldRetryError(error: any): boolean {
    const errorCode = error.code || '';
    const errorMessage = error.message || '';

    // Erreurs réseau temporaires
    if (errorCode.includes('NETWORK') || errorCode.includes('TIMEOUT')) {
      return true;
    }

    // Erreurs de timeout
    if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
      return true;
    }

    // Erreurs de connexion
    if (errorMessage.includes('connection') || errorMessage.includes('connect')) {
      return true;
    }

    // Erreurs de quota/rate limiting (temporaires)
    if (errorCode.includes('QUOTA') || errorCode.includes('RATE_LIMIT')) {
      return true;
    }

    // Par défaut, ne pas retry (erreur permanente comme violation de contrainte)
    return false;
  }

  /**
   * Force une synchronisation manuelle
   */
  async forceSync(): Promise<void> {
    console.log('[SyncManager] Force sync requested');
    await this.syncAll();
  }

  /**
   * Récupère le statut de synchronisation
   */
  async getSyncStatus(): Promise<{
    isSyncing: boolean;
    pendingCount: number;
    errorCount: number;
  }> {
    const stats = await offlineQueue.getStats();
    return {
      isSyncing: this.isSyncing,
      pendingCount: stats.pendingCount,
      errorCount: stats.errorCount,
    };
  }
}

/**
 * Instance singleton du service
 */
export const syncManager = new SyncManagerService();
