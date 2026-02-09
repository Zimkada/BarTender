// SyncManager.ts - Gestion de la synchronisation automatique offline → online
// Orchestre la synchronisation des opérations en queue lors du retour de connexion

import type {
  SyncOperation,
  SyncResult,
  RetryConfig,
  SyncOperationCreateSale,
  SyncOperationUpdateBar,
  SyncOperationCreateTicket,
  SyncOperationPayTicket,
  MutationType
} from '../types/sync';
import { DEFAULT_RETRY_CONFIG } from '../types/sync';
import { networkManager } from './NetworkManager';
import { offlineQueue } from './offlineQueue';
import { supabase } from '../lib/supabase';
import { BarsService } from './supabase/bars.service';
import { broadcastService } from './broadcast/BroadcastService';
import { buildCreateSaleParams, type CreateTicketParams, type PayTicketParams, toSupabaseJson } from '../lib/supabase-rpc.types';
import { getErrorMessage } from '../utils/errorHandler';

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
   * 🛡️ Tampon de sécurité (Phase 8/11.3) :
   * Stocke les clés d'idempotence, les montants et les payloads des ventes tout juste synchronisées
   * pour éviter le "Trou de CA" (Flash) avant que le serveur n'indexe les agrégats.
   *
   * ✅ TTL : 5 minutes - Après ce délai, les entrées sont automatiquement nettoyées
   */
  private static readonly SYNC_KEYS_TTL_MS = 5 * 60 * 1000; // 5 minutes

  private recentlySyncedKeys: Map<string, {
    total: number;
    timestamp: number;
    payload: SyncOperationCreateSale['payload'];
    expiresAt: number; // ✅ TTL pour cleanup automatique
  }> = new Map();

  /**
   * Récupère les clés récemment synchronisées avec leurs détails (pour dédoublonnage UI)
   * ✅ Nettoie automatiquement les entrées expirées avant de retourner
   */
  getRecentlySyncedKeys(): Map<string, { total: number, timestamp: number, payload: SyncOperationCreateSale['payload'] }> {
    this.cleanupExpiredSyncKeys();

    // Retourner sans le champ expiresAt (internal use only)
    const cleaned = new Map<string, { total: number, timestamp: number, payload: SyncOperationCreateSale['payload'] }>();
    this.recentlySyncedKeys.forEach((value, key) => {
      cleaned.set(key, {
        total: value.total,
        timestamp: value.timestamp,
        payload: value.payload
      });
    });
    return cleaned;
  }

  /**
   * 🧹 Nettoie les clés de sync expirées
   * Appelé automatiquement à chaque syncAll() et getRecentlySyncedKeys()
   */
  private cleanupExpiredSyncKeys(): void {
    const now = Date.now();
    let cleanedCount = 0;

    this.recentlySyncedKeys.forEach((value, key) => {
      if (value.expiresAt < now) {
        this.recentlySyncedKeys.delete(key);
        cleanedCount++;
      }
    });

    if (cleanedCount > 0) {
      console.log(`[SyncManager] Cleaned up ${cleanedCount} expired sync keys`);
    }
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

  cleanup(): void {
    try {
      // 🛡️ Clear tous les timers actifs (Anti-Memory Leak)
      this.timers.forEach(timer => clearTimeout(timer));
      this.timers.clear();
    } catch (err) {
      console.error('[SyncManager] Error clearing timers:', err);
    }

    try {
      if (this.networkUnsubscribe) {
        this.networkUnsubscribe();
        this.networkUnsubscribe = null;
      }
    } catch (err) {
      console.error('[SyncManager] Error unsubscribing from network:', err);
    }
    console.log('[SyncManager] Cleaned up with safety guards');
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
    console.log('[SyncManager] Starting sync cycle...');

    // 🧹 Cleanup expired sync keys (Memory leak prevention)
    this.cleanupExpiredSyncKeys();

    try {
      // 🛡️ LOAD PERSISTENT MAPPING (Phase 13 Blindage)
      // On récupère les traductions d'IDs déjà enregistrées dans IndexedDB
      const persistentMappings = await offlineQueue.getIdTranslations();
      this.idMapping = persistentMappings;
      console.log(`[SyncManager] Loaded ${this.idMapping.size} persistent ID translations`);

      // 🛡️ SYNC RESCUE (V11.5): Avant de commencer, on "sauve" les opérations en erreur
      // OU celles restées bloquées en "syncing" (ex: crash au milieu d'un envoi).
      const errorOpsBefore = await offlineQueue.getOperations({ status: 'error' });
      const stuckOpsBefore = await offlineQueue.getOperations({ status: 'syncing' });
      const opsToRescue = [...errorOpsBefore, ...stuckOpsBefore];

      if (opsToRescue.length > 0) {
        console.log(`[SyncManager] Proactive Rescue: resetting ${opsToRescue.length} operations (error/stuck)`);
        for (const op of opsToRescue) {
          await offlineQueue.resetRetries(op.id);
        }
      }

      // Récupérer toutes les opérations à traiter
      const pendingOps = await offlineQueue.getOperations({ status: 'pending' });
      // Note: les errorOps sont maintenant devenus pending grâce au rescue ci-dessus

      console.log(`[SyncManager] Found ${pendingOps.length} operations to sync`);

      if (pendingOps.length === 0) {
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

      // 🚀 BATCH ENGINE (Pillar 4): Group sequential operations
      let i = 0;
      while (i < pendingOps.length) {
        const currentOp = pendingOps[i];

        // Tenter de créer un batch de ventes
        if (currentOp.type === 'CREATE_SALE') {
          // Look ahead for more sales
          const batch: SyncOperationCreateSale[] = [currentOp as SyncOperationCreateSale];
          let j = i + 1;
          const MAX_BATCH_SIZE = 20; // 🛡️ Safe limit for Postgres JSONB

          while (
            j < pendingOps.length &&
            pendingOps[j].type === 'CREATE_SALE' &&
            batch.length < MAX_BATCH_SIZE
          ) {
            batch.push(pendingOps[j] as SyncOperationCreateSale);
            j++;
          }

          if (batch.length > 1) {
            // Process as batch
            console.log(`[SyncManager] Batching ${batch.length} sales...`);
            await this.syncCreateSaleBatch(batch);
            i += batch.length; // Skip processed items
            continue;
          }
        }

        // Fallback: Process individually
        await this.syncOperation(currentOp);
        i++;
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
    // Marquer comme en cours de synchronisation
    await offlineQueue.updateOperationStatus(operation.id, 'syncing');

    try {
      // Synchroniser selon le type d'opération
      const result = await this.syncByType(operation);

      if (result.success) {
        // Succès: marquer comme success et supprimer de la queue
        await offlineQueue.updateOperationStatus(operation.id, 'success');

        // 🛡️ Lock Flash (Phase 8): Alimenter la zone tampon (10s)
        // Cette logique est spécifique à CREATE_SALE
        if (operation.type === 'CREATE_SALE') {
          this.addToRecentbuffer(operation.payload);
        }


        await offlineQueue.removeOperation(operation.id);
        console.log(`[SyncManager] Operation ${operation.id} synced successfully`);

        // 🚀 Dispatcher l'événement de domaine (Elite Mission)
        this.dispatchDomainEvent(operation.type, operation.barId);
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
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      console.error(`[SyncManager] Exception syncing operation ${operation.id}:`, errorMessage);
      await offlineQueue.updateOperationStatus(
        operation.id,
        'error',
        errorMessage || 'Sync exception'
      );
    }
  }

  /**
   * 🚀 Dispatcher d'événements typés (Mission Elite)
   * Permet aux Smart Hooks d'écouter uniquement les changements qui les concernent.
   */
  private dispatchDomainEvent(type: MutationType, barId?: string): void {
    const domainEvents: Record<string, string> = {
      'CREATE_SALE': 'sales-synced',
      'UPDATE_BAR': 'bar-synced',
      'CREATE_TICKET': 'tickets-synced',
      'PAY_TICKET': 'tickets-synced',
      'UPDATE_PRODUCT': 'stock-synced',
      'CREATE_PRODUCT': 'stock-synced',
      'DELETE_PRODUCT': 'stock-synced',
      'ADD_SUPPLY': 'stock-synced',
      'CREATE_RETURN': 'returns-synced',
      'UPDATE_RETURN': 'returns-synced',
      'CREATE_CONSIGNMENT': 'consignments-synced',
      'CLAIM_CONSIGNMENT': 'consignments-synced',
      'FORFEIT_CONSIGNMENT': 'consignments-synced',
      'ADD_EXPENSE': 'expenses-synced',
      'ADD_SALARY': 'expenses-synced'
    };

    const eventName = domainEvents[type];
    if (eventName) {
      console.log(`[SyncManager] Dispatching domain event: ${eventName} (from ${type})`);
      window.dispatchEvent(new CustomEvent(eventName, { detail: { barId, type } }));
    }
  }

  /**
   * 🗺️ ID-Mapping Table (Phase 13)
   * Permet de traduire les IDs temporaires générés offline en IDs réels du serveur
   * pendant le cycle de synchronisation.
   */
  private idMapping: Map<string, string> = new Map();

  /**
   * Synchronise une opération selon son type
   */
  private async syncByType(operation: SyncOperation): Promise<SyncResult> {
    switch (operation.type) {
      case 'CREATE_SALE':
        return this.syncCreateSale(operation);

      case 'CREATE_TICKET':
        return this.syncCreateTicket(operation);

      case 'PAY_TICKET':
        return this.syncPayTicket(operation);

      case 'UPDATE_BAR':
        return this.syncUpdateBar(operation);

      default:
        console.warn(`[SyncManager] Unimplemented operation type: ${operation.type}`);
        return {
          success: false,
          operationId: operation.id,
          error: `Operation type ${operation.type} not yet implemented`,
          shouldRetry: false,
        };
    }
  }

  /**
   * Synchronise la création d'un ticket (v12 - Expert Lead)
   */
  private async syncCreateTicket(operation: SyncOperationCreateTicket): Promise<SyncResult> {
    try {
      const payload = operation.payload;

      // Convertir closing_hour en nombre si c'est une string
      const closingHour = typeof payload.closing_hour === 'string'
        ? parseInt(payload.closing_hour, 10)
        : payload.closing_hour;

      const params: CreateTicketParams = {
        p_bar_id: payload.bar_id,
        p_created_by: payload.created_by,
        p_notes: payload.notes || undefined,
        p_server_id: payload.server_id || undefined,
        p_closing_hour: closingHour,
        p_table_number: payload.table_number || undefined,
        p_customer_name: payload.customer_name || undefined,
        p_idempotency_key: payload.idempotency_key,
      };

      const { data, error } = await supabase.rpc('create_ticket', params).single();

      if (error) {
        return {
          success: false,
          operationId: operation.id,
          error: error.message,
          shouldRetry: this.shouldRetryError(error)
        };
      }

      // Type guard pour vérifier que data a un id
      if (data && typeof data === 'object' && 'id' in data) {
        const realId = String((data as { id: string | number }).id);
        console.log(`[SyncManager] Ticket created: ${payload.temp_id} -> ${realId}`);

        // 🗺️ Enregistrer la correspondance pour les opérations suivantes dans la file
        if (payload.temp_id && realId) {
          this.idMapping.set(payload.temp_id, realId);
          // ✅ Persister le mapping dans IndexedDB pour survie au redémarrage
          await offlineQueue.saveIdTranslation(payload.temp_id, realId);
        }
      }

      return { success: true, operationId: operation.id };
    } catch (error) {
      return {
        success: false,
        operationId: operation.id,
        error: getErrorMessage(error),
        shouldRetry: true
      };
    }
  }

  /**
   * Synchronise le paiement d'un ticket
   */
  private async syncPayTicket(operation: SyncOperationPayTicket): Promise<SyncResult> {
    try {
      const payload = operation.payload;
      let targetTicketId = payload.ticket_id;

      // Traduction d'ID si nécessaire
      if (this.idMapping.has(targetTicketId)) {
        targetTicketId = this.idMapping.get(targetTicketId)!;
        console.log(`[SyncManager] PAY_TICKET: Translated ${payload.ticket_id} to ${targetTicketId}`);
      }

      const params: PayTicketParams = {
        p_ticket_id: targetTicketId,
        p_paid_by: payload.paid_by,
        p_payment_method: payload.payment_method
      };

      const { error } = await supabase.rpc('pay_ticket', params).single();

      if (error) {
        return {
          success: false,
          operationId: operation.id,
          error: error.message,
          shouldRetry: this.shouldRetryError(error)
        };
      }

      return { success: true, operationId: operation.id };
    } catch (error) {
      return {
        success: false,
        operationId: operation.id,
        error: getErrorMessage(error),
        shouldRetry: true
      };
    }
  }

  /**
   * Synchronise une vente créée offline
   */
  private async syncCreateSale(operation: SyncOperationCreateSale): Promise<SyncResult> {
    try {
      const payload = operation.payload;
      let targetTicketId = payload.ticket_id;

      // 🛡️ ID REDIRECTION (Phase 13 : Expert Lead)
      // Si la vente appartient à un ticket créé offline, on redirige vers l'ID serveur réel
      if (targetTicketId && this.idMapping.has(targetTicketId)) {
        const realId = this.idMapping.get(targetTicketId)!;
        console.log(`[SyncManager] SALE REDIRECTION: Mapping ${targetTicketId} -> ${realId}`);
        targetTicketId = realId;
      }

      // Appeler le RPC idempotent pour créer la vente
      const rpcParams = buildCreateSaleParams(
        {
          bar_id: payload.bar_id,
          items: payload.items,
          payment_method: payload.payment_method,
          sold_by: payload.sold_by,
          server_id: payload.server_id,
          status: payload.status,
          customer_name: payload.customer_name,
          customer_phone: payload.customer_phone,
          notes: payload.notes,
          business_date: payload.business_date,
          ticket_id: targetTicketId,
        },
        payload.idempotency_key
      );

      const { data, error } = await supabase.rpc('create_sale_idempotent', rpcParams).single();

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

      // Type guard pour l'ID de la vente créée
      const saleId = data && typeof data === 'object' && 'id' in data
        ? String((data as { id: string | number }).id)
        : 'unknown';

      console.log(`[SyncManager] Sale created successfully: ${saleId}`);

      // 🚀 Broadcast aux autres onglets pour mise à jour immédiate
      if (broadcastService.isSupported()) {
        broadcastService.broadcast({
          event: 'INSERT',
          table: 'sales',
          barId: payload.bar_id,
          data: data,
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
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      console.error(`[SyncManager] Exception creating sale:`, errorMessage);
      return {
        success: false,
        operationId: operation.id,
        error: errorMessage,
        shouldRetry: true,
      };
    }
  }

  /**
   * 🚀 BATCH SYNC: Synchronise un lot de ventes en une seule requête
   */
  private async syncCreateSaleBatch(operations: SyncOperationCreateSale[]): Promise<void> {
    if (operations.length === 0) return;

    const firstOp = operations[0];
    const barId = firstOp.barId;

    // Mark all as syncing
    await Promise.all(operations.map(op => offlineQueue.updateOperationStatus(op.id, 'syncing')));

    try {
      // 1. Préparer le payload
      const salesPayload = operations.map(op => {
        const payload = op.payload;
        let targetTicketId = payload.ticket_id;

        // 🛡️ ID REDIRECTION (Phase 13)
        if (targetTicketId && this.idMapping.has(targetTicketId)) {
          targetTicketId = this.idMapping.get(targetTicketId)!;
        }

        return buildCreateSaleParams({
          bar_id: barId, // Redondant mais requis par le builder
          items: payload.items,
          payment_method: payload.payment_method,
          sold_by: payload.sold_by,
          server_id: payload.server_id,
          status: payload.status,
          customer_name: payload.customer_name,
          customer_phone: payload.customer_phone,
          notes: payload.notes,
          business_date: payload.business_date,
          ticket_id: targetTicketId,
        }, payload.idempotency_key);
      });

      // 2. Appeler le RPC Batch
      // Note: params must match the SQL function signature: (p_bar_id, p_sales)
      const { data, error } = await (supabase.rpc as any)('create_sales_batch', {
        p_bar_id: barId,
        p_sales: toSupabaseJson(salesPayload) // Ensure clean JSON
      });

      if (error) {
        throw error; // Global failure (network, etc) -> Catch block handles retry logic for ALL
      }

      // 3. Traiter les résultats (Partial Success Handling)
      // data is JSONB array of { idempotency_key, success, sale_id, error }
      const results = data as unknown as Array<{
        idempotency_key: string;
        success: boolean;
        sale_id?: string;
        error?: string;
      }>;

      // Map back to operations via idempotency key
      const resultsMap = new Map(results.map(r => [r.idempotency_key, r]));

      for (const op of operations) {
        const result = resultsMap.get(op.payload.idempotency_key);

        if (result && result.success && result.sale_id) {
          // ✅ SUCCÈS
          await offlineQueue.updateOperationStatus(op.id, 'success');
          await offlineQueue.removeOperation(op.id);

          // Buffer logique (Lock Flash)
          this.addToRecentbuffer(op.payload);

          // Broadcast events (Optimized: trigger specific sale event)
          this.dispatchDomainEvent('CREATE_SALE', barId);

        } else {
          // ❌ ÉCHEC INDIVIDUEL
          const errorMsg = result?.error || 'Batch result missing';
          console.error(`[SyncManager] Batch operation failed for ${op.id}: ${errorMsg}`);
          await offlineQueue.updateOperationStatus(op.id, 'error', errorMsg);
        }
      }

      console.log(`[SyncManager] Batch processed: ${results.filter(r => r.success).length}/${results.length} success`);

      // Global broadcast for stock update (once per batch instead of N times)
      if (broadcastService.isSupported()) {
        broadcastService.broadcast({
          event: 'UPDATE',
          table: 'bar_products',
          barId: barId,
        });
      }

    } catch (error) {
      // Global Failure (Network timeout, RPC crash)
      // Retry ALL operations in the batch
      console.error('[SyncManager] Batch RPC failed completely:', error);
      const shouldRetry = this.shouldRetryError(error);
      const errorMsg = getErrorMessage(error);

      for (const op of operations) {
        await offlineQueue.updateOperationStatus(
          op.id,
          'error',
          errorMsg
        );
      }
    }
  }

  /**
   * Helper pour alimenter le buffer anti-flash (extrait de syncCreateSale)
   */
  private addToRecentbuffer(payload: SyncOperationCreateSale['payload']) {
    const idempotencyKey = payload.idempotency_key;
    const total = payload.items?.reduce((sum: number, item) => {
      return sum + (item.total_price || (item.unit_price * item.quantity) || 0);
    }, 0) || 0;

    const now = Date.now();
    this.recentlySyncedKeys.set(idempotencyKey, {
      total,
      timestamp: now,
      payload: payload,
      expiresAt: now + SyncManagerService.SYNC_KEYS_TTL_MS
    });

    // Clear previous timer
    if (this.timers.has(idempotencyKey)) {
      clearTimeout(this.timers.get(idempotencyKey)!);
    }

    const timerId = setTimeout(() => {
      this.recentlySyncedKeys.delete(idempotencyKey);
      this.timers.delete(idempotencyKey);
    }, 10000);

    this.timers.set(idempotencyKey, timerId);
  }

  /**
   * Synchronise une mise à jour de bar (Settings)
   */
  private async syncUpdateBar(operation: SyncOperationUpdateBar): Promise<SyncResult> {
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
      const supabaseUpdates: Record<string, unknown> = {};
      if (updates.name) supabaseUpdates.name = updates.name;
      if (updates.address) supabaseUpdates.address = updates.address;
      if (updates.phone) supabaseUpdates.phone = updates.phone;
      if (updates.settings) supabaseUpdates.settings = updates.settings;
      if (updates.is_active !== undefined) supabaseUpdates.is_active = updates.is_active;
      if (updates.closing_hour !== undefined) supabaseUpdates.closing_hour = updates.closing_hour;
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

    } catch (error) {
      const errorMessage = getErrorMessage(error);
      console.error(`[SyncManager] Exception updating bar:`, errorMessage);

      const shouldRetry = this.shouldRetryError(error);

      return {
        success: false,
        operationId: operation.id,
        error: errorMessage,
        shouldRetry: shouldRetry,
      };
    }
  }

  /**
   * Détermine si une erreur est temporaire et mérite un retry
   */
  private shouldRetryError(error: unknown): boolean {
    // Extraction type-safe du code et message d'erreur
    const errorCode = typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : '';
    const errorMessage = getErrorMessage(error);

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
    console.log('[SyncManager] Force sync requested (Rescue mode)');

    // 🛡️ SYNC RESCUE (V11.5): On "sauve" les opérations en erreur en remettant à zéro leurs retries
    try {
      const errorOps = await offlineQueue.getOperations({ status: 'error' });
      if (errorOps.length > 0) {
        console.log(`[SyncManager] Rescuing ${errorOps.length} failed operations...`);
        for (const op of errorOps) {
          await offlineQueue.resetRetries(op.id);
        }
      }
    } catch (err) {
      console.error('[SyncManager] Error during sync rescue:', err);
    }

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
