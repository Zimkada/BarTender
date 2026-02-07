// sync.ts - Types pour système de synchronisation offline/online
// Architecture propre avant migration Supabase

/**
 * Types de mutations supportées par le système de sync
 * Chaque opération métier a son type pour traçabilité
 */
export type MutationType =
  | 'CREATE_SALE'           // Nouvelle vente
  | 'UPDATE_PRODUCT'        // Mise à jour produit (stock, prix, etc.)
  | 'CREATE_RETURN'         // Nouveau retour
  | 'UPDATE_RETURN'         // Mise à jour statut retour (approved, rejected)
  | 'CREATE_CONSIGNMENT'    // Nouvelle consignation
  | 'CLAIM_CONSIGNMENT'     // Récupération consignation
  | 'FORFEIT_CONSIGNMENT'   // Confiscation consignation
  | 'ADD_EXPENSE'           // Nouvelle dépense
  | 'ADD_SALARY'            // Nouveau paiement salaire
  | 'ADD_SUPPLY'            // Nouvel approvisionnement
  | 'CREATE_PRODUCT'        // Nouveau produit
  | 'DELETE_PRODUCT'        // Suppression produit
  | 'CREATE_TICKET'         // Nouveau bon (pas supporté offline en V1)
  | 'PAY_TICKET'            // Paiement du bon (pas supporté offline en V1)
  | 'UPDATE_BAR'            // Mise à jour des paramètres du bar (Settings)
  | 'CREATE_SERVER_MAPPING';// Création mapping serveur (v11.8 - Auto-mapping)

/**
 * Statut d'une opération dans la queue de sync
 */
export type SyncOperationStatus =
  | 'pending'   // En attente de synchronisation
  | 'syncing'   // Synchronisation en cours
  | 'success'   // Synchronisée avec succès
  | 'error';    // Erreur lors de la synchronisation

/**
 * Payload pour la création d'une vente
 */
export interface CreateSalePayload {
  bar_id: string;
  items: any[]; // On pourra affiner avec SaleItem plus tard
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
}

/**
 * Payload pour la mise à jour d'un bar
 */
export interface UpdateBarPayload {
  barId: string;
  updates: Record<string, any>; // Partial<Bar> idealement mais pour l'instant any pour éviter dépendance circulaire
}

/**
 * Payload pour la création d'un mapping serveur (v11.8)
 */
export interface CreateServerMappingPayload {
  barId: string;
  serverName: string;
  userId: string;
}

/**
 * Payload pour la création d'un ticket (v12)
 */
export interface CreateTicketPayload {
  bar_id: string;
  created_by: string;
  notes?: string | null;
  server_id?: string | null;
  closing_hour: number;
  table_number?: number | null;
  customer_name?: string | null;
  idempotency_key: string;
  temp_id: string; // Utilisé pour ID Mapping
}

/**
 * Payload pour le paiement d'un ticket (v12)
 */
export interface PayTicketPayload {
  ticket_id: string;
  paid_by: string;
  payment_method: string;
  idempotency_key: string;
}

/**
 * Structure de base commune à toutes les opérations
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
export type SyncOperationCreateSale = SyncOperationBase & {
  type: 'CREATE_SALE';
  payload: CreateSalePayload;
};

export type SyncOperationUpdateBar = SyncOperationBase & {
  type: 'UPDATE_BAR';
  payload: UpdateBarPayload;
};

export type SyncOperationCreateServerMapping = SyncOperationBase & {
  type: 'CREATE_SERVER_MAPPING';
  payload: CreateServerMappingPayload;
};

export type SyncOperationCreateTicket = SyncOperationBase & {
  type: 'CREATE_TICKET';
  payload: CreateTicketPayload;
};

export type SyncOperationPayTicket = SyncOperationBase & {
  type: 'PAY_TICKET';
  payload: PayTicketPayload;
};

export type SyncOperationGeneric = SyncOperationBase & {
  type: Exclude<MutationType, 'CREATE_SALE' | 'UPDATE_BAR' | 'CREATE_SERVER_MAPPING' | 'CREATE_TICKET' | 'PAY_TICKET'>;
  payload: any;
};

/**
 * Union discriminée pour type-safety
 */
export type SyncOperation =
  | SyncOperationCreateSale
  | SyncOperationUpdateBar
  | SyncOperationCreateServerMapping
  | SyncOperationCreateTicket
  | SyncOperationPayTicket
  | SyncOperationGeneric;

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
