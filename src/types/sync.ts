import type { Database } from '../lib/database.types';

/**
 * Types de mutations supportées par le système de sync
 */
export type MutationType =
  | 'CREATE_SALE'
  | 'UPDATE_PRODUCT'
  | 'CREATE_RETURN'
  | 'UPDATE_RETURN'
  | 'CREATE_CONSIGNMENT'
  | 'CLAIM_CONSIGNMENT'
  | 'FORFEIT_CONSIGNMENT'
  | 'ADD_EXPENSE'
  | 'ADD_SALARY'
  | 'ADD_SUPPLY'
  | 'CREATE_PRODUCT'
  | 'DELETE_PRODUCT'
  | 'CREATE_TICKET'
  | 'PAY_TICKET'
  | 'UPDATE_BAR'
  | 'CREATE_SERVER_MAPPING';

/**
 * Statut d'une opération dans la queue de sync
 */
export type SyncOperationStatus =
  | 'pending'
  | 'syncing'
  | 'success'
  | 'error';

// Helper types from Database
type TableInsert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
type TableUpdate<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];

/**
 * Payload pour la création d'une vente
 */
export interface SaleItem {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  original_unit_price?: number;
  discount_amount?: number;
  promotion_id?: string;
}

export interface CreateSalePayload {
  bar_id: string;
  items: SaleItem[];
  payment_method: string;
  sold_by: string;
  server_id?: string | null;
  status: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  notes?: string | null;
  business_date?: string | null;
  ticket_id?: string | null;
  idempotency_key: string;
  source_return_id?: string | null; // ✨ NOUVEAU: Traçabilité Échange
}

/**
 * Payloads spécifiques pour les autres opérations
 */
export type CreateReturnPayload = TableInsert<'returns'>;
export type UpdateReturnPayload = { id: string; updates: TableUpdate<'returns'> };
export type CreateConsignmentPayload = TableInsert<'consignments'>;
export type UpdateConsignmentPayload = { id: string; status: string; updates?: TableUpdate<'consignments'> };
export type AddExpensePayload = TableInsert<'expenses'>;
export type AddSupplyPayload = TableInsert<'supplies'>;
export type UpdateProductPayload = { id: string; updates: TableUpdate<'bar_products'> };
export type CreateProductPayload = TableInsert<'bar_products'>;

export interface UpdateBarPayload {
  barId: string;
  updates: TableUpdate<'bars'>;
}

export interface CreateServerMappingPayload {
  barId: string;
  serverName: string;
  userId: string;
}

export interface CreateTicketPayload {
  bar_id: string;
  created_by: string;
  notes?: string | null;
  server_id?: string | null;
  closing_hour: number;
  table_number?: number | null;
  customer_name?: string | null;
  idempotency_key: string;
  temp_id: string;
}

export interface PayTicketPayload {
  ticket_id: string;
  paid_by: string;
  payment_method: string;
  idempotency_key: string;
}

/**
 * Structure de base commune
 */
interface SyncOperationBase {
  id: string;
  timestamp: number;
  retryCount: number;
  status: SyncOperationStatus;
  errorMessage?: string;
  lastAttemptAt?: number;
  barId: string;
  userId: string;
}

/**
 * Opérations spécifiques typées
 */
export type SyncOperationCreateSale = SyncOperationBase & { type: 'CREATE_SALE'; payload: CreateSalePayload };
export type SyncOperationUpdateBar = SyncOperationBase & { type: 'UPDATE_BAR'; payload: UpdateBarPayload };
export type SyncOperationCreateServerMapping = SyncOperationBase & { type: 'CREATE_SERVER_MAPPING'; payload: CreateServerMappingPayload };
export type SyncOperationCreateTicket = SyncOperationBase & { type: 'CREATE_TICKET'; payload: CreateTicketPayload };
export type SyncOperationPayTicket = SyncOperationBase & { type: 'PAY_TICKET'; payload: PayTicketPayload };
export type SyncOperationCreateReturn = SyncOperationBase & { type: 'CREATE_RETURN'; payload: CreateReturnPayload };
export type SyncOperationUpdateReturn = SyncOperationBase & { type: 'UPDATE_RETURN'; payload: UpdateReturnPayload };
export type SyncOperationCreateConsignment = SyncOperationBase & { type: 'CREATE_CONSIGNMENT'; payload: CreateConsignmentPayload };
export type SyncOperationUpdateConsignment = SyncOperationBase & { type: 'CLAIM_CONSIGNMENT' | 'FORFEIT_CONSIGNMENT'; payload: UpdateConsignmentPayload };
export type SyncOperationAddExpense = SyncOperationBase & { type: 'ADD_EXPENSE' | 'ADD_SALARY'; payload: AddExpensePayload };
export type SyncOperationAddSupply = SyncOperationBase & { type: 'ADD_SUPPLY'; payload: AddSupplyPayload };
export type SyncOperationUpdateProduct = SyncOperationBase & { type: 'UPDATE_PRODUCT'; payload: UpdateProductPayload };
export type SyncOperationCreateProduct = SyncOperationBase & { type: 'CREATE_PRODUCT'; payload: CreateProductPayload };
export type SyncOperationDeleteProduct = SyncOperationBase & { type: 'DELETE_PRODUCT'; payload: { id: string } };

/**
 * Union discriminée pour type-safety
 */
export type SyncOperation =
  | SyncOperationCreateSale
  | SyncOperationUpdateBar
  | SyncOperationCreateServerMapping
  | SyncOperationCreateTicket
  | SyncOperationPayTicket
  | SyncOperationCreateReturn
  | SyncOperationUpdateReturn
  | SyncOperationCreateConsignment
  | SyncOperationUpdateConsignment
  | SyncOperationAddExpense
  | SyncOperationAddSupply
  | SyncOperationUpdateProduct
  | SyncOperationCreateProduct
  | SyncOperationDeleteProduct;

/**
 * État du réseau détecté
 */
export type NetworkStatus =
  | 'online'    // Connecté au réseau
  | 'offline'   // Hors ligne (confirmé après grace period)
  | 'unstable'  // Connexion instable (grace period en cours)
  | 'checking'; // Vérification en cours

/**
 * État global du système de synchronisation
 */
export interface SyncStatus {
  /** Statut réseau actuel */
  networkStatus: NetworkStatus;

  /** Nombre d'opérations en attente de sync */
  pendingCount: number;

  /** Nombre d'opérations en cours de sync */
  syncingCount: number;

  /** Nombre d'opérations en erreur */
  errorCount: number;

  /** Timestamp du dernier succès de sync */
  lastSyncAt: number | null;

  /** La synchronisation est-elle en cours */
  isSyncing: boolean;
}

/**
 * Configuration du retry avec backoff exponentiel
 */
export interface RetryConfig {
  /** Nombre maximum de tentatives */
  maxRetries: number;

  /** Délai initial en ms */
  initialDelay: number;

  /** Facteur multiplicateur pour backoff exponentiel */
  backoffFactor: number;

  /** Délai maximum entre tentatives en ms */
  maxDelay: number;
}

/**
 * Configuration par défaut du retry
 */
export const DEFAULT_RETRY_CONFIG: Readonly<RetryConfig> = {
  maxRetries: 5,
  initialDelay: 1000,      // 1 seconde
  backoffFactor: 2,        // Double à chaque tentative
  maxDelay: 60000,         // 1 minute max
};

/**
 * Résultat d'une tentative de synchronisation
 */
export interface SyncResult {
  /** L'opération a-t-elle réussi */
  success: boolean;

  /** ID de l'opération synchronisée */
  operationId: string;

  /** Message d'erreur si échec */
  error?: string;

  /** Faut-il réessayer (true si erreur temporaire) */
  shouldRetry?: boolean;
}
