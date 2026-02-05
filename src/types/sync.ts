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
  | 'PAY_TICKET';           // Paiement du bon (pas supporté offline en V1)

/**
 * Statut d'une opération dans la queue de sync
 */
export type SyncOperationStatus =
  | 'pending'   // En attente de synchronisation
  | 'syncing'   // Synchronisation en cours
  | 'success'   // Synchronisée avec succès
  | 'error';    // Erreur lors de la synchronisation

/**
 * Une opération de synchronisation dans la queue
 *
 * @example
 * {
 *   id: 'sync_1234567890_abc',
 *   type: 'CREATE_SALE',
 *   payload: { items: [...], total: 5000 },
 *   timestamp: 1697812345678,
 *   retryCount: 0,
 *   status: 'pending'
 * }
 */
export interface SyncOperation {
  /** ID unique de l'opération (format: sync_timestamp_random) */
  id: string;

  /** Type de mutation à synchroniser */
  type: MutationType;

  /** Données de l'opération (structure dépend du type) */
  payload: any;

  /** Timestamp de création (milliseconds depuis epoch) */
  timestamp: number;

  /** Nombre de tentatives de synchronisation */
  retryCount: number;

  /** Statut actuel de l'opération */
  status: SyncOperationStatus;

  /** Message d'erreur si status === 'error' */
  errorMessage?: string;

  /** Timestamp de la dernière tentative */
  lastAttemptAt?: number;

  /** ID du bar concerné (pour multi-tenant isolation) */
  barId: string;

  /** ID de l'utilisateur qui a créé l'opération */
  userId: string;
}

/**
 * État du réseau détecté
 */
export type NetworkStatus =
  | 'online'    // Connecté au réseau
  | 'offline'   // Hors ligne
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
