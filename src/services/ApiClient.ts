// ApiClient.ts - Client HTTP pour synchronisation avec backend Supabase
import { SYNC_CONFIG, isSupabaseEnabled } from '../config/sync.config';
import type { SyncOperation } from '../types/sync';
import type {
  Sale,
  Return,
  Expense,
  Product,
  Supply,
  Consignment,
  Salary,
} from '../types';

/**
 * Résultat d'une opération de sync
 */
export interface ApiResponse {
  success: boolean;
  error?: string;
  data?: any;
}

/**
 * Configuration du client API
 */
interface ApiClientConfig {
  baseUrl: string;
  apiKey: string;
  timeout?: number;
}

/**
 * Client API pour communiquer avec Supabase
 *
 * Architecture:
 * - Mode MOCK: Simule succès pour tests locaux
 * - Mode SUPABASE: Vraies requêtes HTTP vers Supabase
 */
class ApiClient {
  private config: ApiClientConfig;
  private isEnabled: boolean;

  constructor() {
    this.config = {
      baseUrl: SYNC_CONFIG.SUPABASE_URL,
      apiKey: SYNC_CONFIG.SUPABASE_KEY,
      timeout: 10000, // 10 secondes
    };
    this.isEnabled = isSupabaseEnabled();

    if (SYNC_CONFIG.DEBUG) {
      console.log('[ApiClient] Initialized:', {
        enabled: this.isEnabled,
        mode: this.isEnabled ? 'SUPABASE' : 'MOCK',
        baseUrl: this.config.baseUrl ? '✅ Configured' : '❌ Missing',
      });
    }
  }

  /**
   * Point d'entrée principal: Synchronise une opération vers le backend
   *
   * @param operation - Opération à synchroniser
   * @returns Résultat de la synchronisation
   */
  async syncOperation(operation: SyncOperation): Promise<ApiResponse> {
    if (!this.isEnabled) {
      return this.mockSync(operation);
    }

    try {
      // Dispatcher vers la méthode appropriée selon le type
      switch (operation.type) {
        case 'CREATE_SALE':
          return await this.createSale(operation.payload as Sale, operation.barId);
        case 'CREATE_RETURN':
          return await this.createReturn(operation.payload as Return, operation.barId);
        case 'UPDATE_RETURN':
          return await this.updateReturn(operation.payload, operation.barId);
        case 'ADD_EXPENSE':
          return await this.addExpense(operation.payload as Expense, operation.barId);
        case 'CREATE_PRODUCT':
          return await this.createProduct(operation.payload as Product, operation.barId);
        case 'UPDATE_PRODUCT':
          return await this.updateProduct(operation.payload, operation.barId);
        case 'DELETE_PRODUCT':
          return await this.deleteProduct(operation.payload, operation.barId);
        case 'ADD_SUPPLY':
          return await this.addSupply(operation.payload as Supply, operation.barId);
        case 'CREATE_CONSIGNMENT':
          return await this.createConsignment(operation.payload as Consignment, operation.barId);
        case 'CLAIM_CONSIGNMENT':
          return await this.claimConsignment(operation.payload, operation.barId);
        case 'FORFEIT_CONSIGNMENT':
          return await this.forfeitConsignment(operation.payload, operation.barId);
        case 'ADD_SALARY':
          return await this.addSalary(operation.payload as Salary, operation.barId);
        default:
          return {
            success: false,
            error: `Type d'opération non supporté: ${operation.type}`,
          };
      }
    } catch (error) {
      console.error('[ApiClient] Erreur sync:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue',
      };
    }
  }

  // ===== SALES =====

  private async createSale(salePayload: any, barId: string): Promise<ApiResponse> {
    // Le payload stocké dans SyncQueue via useSalesMutations contient déjà la structure attendue :
    // { bar_id, items, payment_method, sold_by, ... }

    // On mappe vers les paramètres de la RPC create_sale_with_promotions
    const rpcParams = {
      p_bar_id: salePayload.bar_id || barId, // Fallback
      p_items: salePayload.items,
      p_payment_method: salePayload.payment_method,
      p_sold_by: salePayload.sold_by,
      p_server_id: salePayload.server_id || null,
      p_status: salePayload.status,
      p_customer_name: salePayload.customer_name || null,
      p_customer_phone: salePayload.customer_phone || null,
      p_notes: salePayload.notes || null,
      p_business_date: salePayload.business_date || null
    };

    return await this.post('/rpc/create_sale_with_promotions', rpcParams);
  }

  // ===== RETURNS =====

  private async createReturn(returnData: Return, barId: string): Promise<ApiResponse> {
    return await this.post('/rpc/create_return', { return: returnData, bar_id: barId });
  }

  private async updateReturn(payload: { returnId: string; updates: Partial<Return> }, barId: string): Promise<ApiResponse> {
    return await this.post('/rpc/update_return', {
      return_id: payload.returnId,
      updates: payload.updates,
      bar_id: barId,
    });
  }

  // ===== EXPENSES =====

  private async addExpense(expense: Expense, barId: string): Promise<ApiResponse> {
    return await this.post('/rpc/add_expense', { expense, bar_id: barId });
  }

  // ===== PRODUCTS =====

  private async createProduct(product: Product, barId: string): Promise<ApiResponse> {
    return await this.post('/rpc/create_product', { product, bar_id: barId });
  }

  private async updateProduct(payload: { productId: string; updates: Partial<Product> }, barId: string): Promise<ApiResponse> {
    return await this.post('/rpc/update_product', {
      product_id: payload.productId,
      updates: payload.updates,
      bar_id: barId,
    });
  }

  private async deleteProduct(payload: { productId: string }, barId: string): Promise<ApiResponse> {
    return await this.post('/rpc/delete_product', {
      product_id: payload.productId,
      bar_id: barId,
    });
  }

  // ===== SUPPLIES =====

  private async addSupply(supply: Supply, barId: string): Promise<ApiResponse> {
    return await this.post('/rpc/add_supply', { supply, bar_id: barId });
  }

  // ===== CONSIGNMENTS =====

  private async createConsignment(consignment: Consignment, barId: string): Promise<ApiResponse> {
    return await this.post('/rpc/create_consignment', { consignment, bar_id: barId });
  }

  private async claimConsignment(payload: { consignmentId: string; claimedBy: string; claimedAt: Date }, barId: string): Promise<ApiResponse> {
    return await this.post('/rpc/claim_consignment', {
      consignment_id: payload.consignmentId,
      claimed_by: payload.claimedBy,
      claimed_at: payload.claimedAt.toISOString(),
      bar_id: barId,
    });
  }

  private async forfeitConsignment(payload: { consignmentId: string }, barId: string): Promise<ApiResponse> {
    return await this.post('/rpc/forfeit_consignment', {
      consignment_id: payload.consignmentId,
      bar_id: barId,
    });
  }

  // ===== SALARIES =====

  private async addSalary(salary: Salary, barId: string): Promise<ApiResponse> {
    return await this.post('/rpc/add_salary', { salary, bar_id: barId });
  }

  // ===== HTTP METHODS =====

  /**
   * Requête POST vers Supabase
   */
  private async post(endpoint: string, data: any): Promise<ApiResponse> {
    const url = `${this.config.baseUrl}${endpoint}`;

    if (SYNC_CONFIG.DEBUG) {
      console.log('[ApiClient] POST:', url, data);
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.config.apiKey,
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(data),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();

      if (SYNC_CONFIG.DEBUG) {
        console.log('[ApiClient] Response:', result);
      }

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      console.error('[ApiClient] POST Error:', error);

      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          error: 'Timeout: Le serveur ne répond pas',
        };
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur réseau',
      };
    }
  }

  /**
   * Mode MOCK: Simule succès pour tests locaux sans backend
   */
  private async mockSync(operation: SyncOperation): Promise<ApiResponse> {
    // Simuler délai réseau (50-200ms)
    const delay = 50 + Math.random() * 150;
    await new Promise(resolve => setTimeout(resolve, delay));

    // Simuler taux d'échec de 5% pour tester retry
    const failureRate = 0.05;
    const shouldFail = Math.random() < failureRate;

    if (shouldFail) {
      if (SYNC_CONFIG.DEBUG) {
        console.log('[ApiClient] 🚧 MOCK FAILURE:', operation.type);
      }
      return {
        success: false,
        error: 'Mock: Simulated network error',
      };
    }

    if (SYNC_CONFIG.DEBUG) {
      console.log('[ApiClient] ✅ MOCK SUCCESS:', operation.type, operation.payload);
    }

    return {
      success: true,
      data: {
        id: operation.payload.id || `mock_${Date.now()}`,
        synced_at: new Date().toISOString(),
      },
    };
  }
}

// Export singleton
export const apiClient = new ApiClient();
