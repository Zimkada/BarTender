// types/index.ts - VERSION UNIFIÉE MULTI-TENANT

// ===== UTILISATEURS & AUTHENTIFICATION =====
export type UserRole = 'super_admin' | 'promoteur' | 'gerant' | 'serveur';

export interface User {
  id: string;
  username: string;
  password: string;
  name: string;
  phone: string;
  email?: string;
  createdAt: Date;
  createdBy?: string;
  isActive: boolean;
  firstLogin: boolean;
  lastLoginAt?: Date;
}

export interface UserSession {
  userId: string;
  userName: string;
  role: UserRole;
  barId: string;
  barName: string;
  loginTime: Date;
  permissions: RolePermissions;
  firstLogin?: boolean;
}

// ===== BARS & ORGANISATION =====
export interface Bar {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  ownerId: string;
  createdAt: Date;
  isActive: boolean;
  settings: BarSettings;
}

export interface BarSettings {
  currency: string;
  currencySymbol: string;
  timezone?: string;
  language?: string;
  businessDayCloseHour?: number; // Heure de clôture de la journée commerciale (0-23, défaut: 6h)
  operatingMode?: 'full' | 'simplified'; // Mode de fonctionnement : complet (avec comptes serveurs) ou simplifié (gérant attribue)
  serversList?: string[]; // Liste des serveurs (mode simplifié uniquement)
  consignmentExpirationDays?: number; // Nombre de jours avant expiration consignation (défaut: 7)
}

export interface BarMember {
  id: string;
  userId: string;
  barId: string;
  role: UserRole;
  assignedBy: string;
  assignedAt: Date;
  isActive: boolean;
  user?: User; // Enriched data
}

// ===== PRODUITS & INVENTAIRE =====
export interface Category {
  id: string;
  barId: string; // ✅ Tous les types incluent barId
  name: string;
  color: string;
  createdAt: Date;
}

export interface Product {
  id: string;
  barId: string; // ✅ Tous les types incluent barId
  name: string;
  volume: string;
  price: number;
  stock: number;
  categoryId: string;
  image?: string;
  alertThreshold: number;
  createdAt: Date;
}

export interface Supply {
  id: string;
  barId: string; // ✅ Tous les types incluent barId
  productId: string;
  quantity: number;
  lotSize: number;
  lotPrice: number;
  supplier: string;
  date: Date;
  totalCost: number;
  createdBy: string; // Qui a enregistré l'approv
}

// ===== CATALOGUE GLOBAL =====
export interface GlobalCategory {
  id: string;
  name: string;
  color: string;
  icon?: string;
  orderIndex: number;
  isSystem: boolean;
  createdAt: Date;
}

export interface GlobalProduct {
  id: string;
  name: string;
  brand?: string;
  manufacturer?: string;
  volume: string;
  volumeMl?: number;
  category: string; // Nom de la catégorie globale
  subcategory?: string;
  officialImage?: string;
  barcode?: string;
  description?: string;
  suggestedPriceMin?: number;
  suggestedPriceMax?: number;
  isActive: boolean;
  createdBy?: string;
  createdAt: Date;
}

// ===== COMPTABILITÉ =====
export type TransactionType =
  | 'sale'           // Vente
  | 'return'         // Retour
  | 'supply'         // Approvisionnement
  | 'expense'        // Dépense
  | 'salary'         // Salaire
  | 'consignment'    // Consignation (neutre en trésorerie, déjà payé)
  | 'initial_balance'; // Solde initial (point de départ comptabilité)

export type ExpenseCategory =
  | 'supply'         // 📦 Approvisionnements (auto-généré)
  | 'water'          // 💧 Eau
  | 'electricity'    // ⚡ Électricité
  | 'maintenance'    // 🔧 Entretien/Réparations
  | 'investment'     // 📈 Investissement
  | 'custom';        // Personnalisée

export interface ExpenseCategoryCustom {
  id: string;
  barId: string;
  name: string;
  icon?: string;
  createdAt: Date;
  createdBy: string;
}

export interface Expense {
  id: string;
  barId: string;
  amount: number;
  category: ExpenseCategory;
  customCategoryId?: string; // Si category === 'custom'
  date: Date;
  description?: string;      // Description de la dépense
  notes?: string;
  relatedSupplyId?: string;  // ID de l'approvisionnement lié (si category === 'supply')
  createdBy: string;
  createdAt: Date;
}

export interface Salary {
  id: string;
  barId: string;
  memberId: string;     // Lié à BarMember
  amount: number;
  period: string;       // 'YYYY-MM' (ex: '2025-01')
  paidAt: Date;
  createdBy: string;
  createdAt: Date;
}

export interface InitialBalance {
  id: string;
  barId: string;
  amount: number;           // Montant du solde initial (peut être négatif si dettes)
  date: Date;               // Date de référence du solde
  description: string;      // Ex: "Solde ouverture bar", "Solde début exercice 2025"
  createdBy: string;        // Qui a saisi ce solde
  createdAt: Date;          // Quand la saisie a été faite
  isLocked?: boolean;       // ✅ Verrouillé si transactions postérieures existent
}

// Source d'apport de capital
export type CapitalSource = 'owner' | 'partner' | 'investor' | 'loan' | 'other';

// Apport de capital (ENTRÉE d'argent pour renforcer la trésorerie)
export interface CapitalContribution {
  id: string;
  barId: string;
  amount: number;           // ✅ TOUJOURS POSITIF (entrée d'argent)
  date: Date;               // Date de l'apport
  description: string;      // Ex: "Apport pour couvrir fournisseur urgent"
  source: CapitalSource;    // Origine de l'apport
  sourceDetails?: string;   // Ex: "Prêt Banque ABC", "Associé Guy GOUNOU"
  createdBy: string;        // Qui a enregistré cet apport
  createdAt: Date;          // Quand l'apport a été enregistré
}

export interface AccountingTransaction {
  id: string;
  barId: string;
  type: TransactionType;
  amount: number;       // Positif = entrée, Négatif = sortie
  date: Date;
  referenceId?: string; // ID de la vente/retour/approv/dépense/salaire
  description: string;
  createdBy: string;
  createdAt: Date;
}

// ===== VENTES & COMMANDES =====
export interface CartItem {
  product: Product;
  quantity: number;
  returned?: number;
}

export interface Sale {
  id: string;
  barId: string;
  items: CartItem[];
  total: number;
  currency: string;

  // Le cycle de vie de la vente pour la validation par le gérant
  status: 'pending' | 'validated' | 'rejected';

  // Traçabilité des actions
  createdBy: string;      // ID du serveur qui a initié la vente
  validatedBy?: string;   // ID du gérant qui a validé et sorti le stock
  rejectedBy?: string;    // ID du gérant qui a rejeté la demande

  // Timestamps pour l'audit
  createdAt: Date;        // Date de création par le serveur
  validatedAt?: Date;     // Date de validation par le gérant
  rejectedAt?: Date;      // Date de rejet par le gérant

  // Optionnel, pour le mode simplifié ou pour référence
  assignedTo?: string;    // En mode simplifié : nom du serveur qui a servi (ex: "Marie")
  tableNumber?: string;   // Numéro de la table si applicable
}

// ===== RETOURS =====
export type ReturnReason = 'defective' | 'wrong_item' | 'customer_change' | 'expired' | 'other';

export interface ReturnReasonConfig {
  label: string;
  description: string; // Description détaillée pour clarté mobile
  icon: string; // Emoji représentatif
  color: string;
  autoRestock: boolean; // Remise en stock automatique ?
  autoRefund: boolean; // Remboursement automatique ?
}

export interface Return {
  id: string;
  barId: string; // ✅ Multi-tenant
  saleId: string;
  productId: string;
  productName: string;
  productVolume: string;
  quantitySold: number;
  quantityReturned: number;
  reason: ReturnReason;
  returnedBy: string; // userId
  returnedAt: Date;
  refundAmount: number;
  isRefunded: boolean; // ✅ Le client a-t-il été remboursé ?
  status: 'pending' | 'approved' | 'rejected' | 'restocked';
  autoRestock: boolean;
  manualRestockRequired: boolean;
  restockedAt?: Date;
  notes?: string;

  // ✅ NOUVEAU : Choix custom pour motif "other"
  customRefund?: boolean;   // Décision manuelle gérant : rembourser ?
  customRestock?: boolean;  // Décision manuelle gérant : remettre en stock ?

  // ✅ NOUVEAU : Traçabilité vendeur original
  originalSeller?: string;  // userId du vendeur qui a créé la vente originale
}

// ===== CONSIGNATIONS =====
export type ConsignmentStatus =
  | 'active'      // En cours (produit consigné, client peut récupérer)
  | 'claimed'     // Récupéré (client a récupéré ses produits)
  | 'expired'     // Expiré (délai dépassé, produit retourne au stock vendable)
  | 'forfeited';  // Confisqué (client a renoncé, stock retourne immédiatement)

export interface Consignment {
  id: string;
  barId: string;

  // Référence vente originale
  saleId: string;
  productId: string;
  productName: string;
  productVolume: string;

  // Quantités
  quantity: number;               // Quantité consignée

  // Montant (déjà payé lors de la vente)
  totalAmount: number;            // Montant total (quantity × prix vente)

  // Dates
  createdAt: Date;                // Date consignation
  expiresAt: Date;                // Date expiration (7-30j configurable)
  claimedAt?: Date;               // Date récupération

  // Statut
  status: ConsignmentStatus;

  // Traçabilité
  createdBy: string;              // userId qui a créé la consignation
  claimedBy?: string;             // userId qui a validé la récupération
  originalSeller?: string;        // ✅ userId du vendeur qui a créé la vente originale

  // Optionnel - Identification client
  customerName?: string;          // Nom client (pour retrouver facilement)
  customerPhone?: string;         // Téléphone client
  notes?: string;                 // Notes additionnelles
}

// Stock consigné par produit (calculé dynamiquement)
export interface ConsignmentStock {
  productId: string;
  barId: string;
  quantityConsigned: number;      // Total produits actuellement consignés (status = 'active')
  lastUpdated: Date;
}

// Informations stock enrichies (pour affichage)
export interface ProductStockInfo {
  productId: string;
  physicalStock: number;          // Stock physique total (Product.stock)
  consignedStock: number;         // Stock consigné (réservé, non vendable)
  availableStock: number;         // Stock vendable = physicalStock - consignedStock
}

// ===== PERMISSIONS =====
export interface RolePermissions {
  // Gestion utilisateurs
  canManageUsers: boolean;
  canCreateManagers: boolean;
  canCreateServers: boolean;

  // Gestion produits
  canAddProducts: boolean;
  canEditProducts: boolean;
  canDeleteProducts: boolean;

  // Gestion inventaire
  canManageInventory: boolean;
  canViewInventory: boolean;

  // Ventes
  canSell: boolean;
  canCancelSales: boolean;
  canViewAllSales: boolean;
  canViewOwnSales: boolean;

  // Analytics
  canViewAnalytics: boolean;
  canExportData: boolean;

  // Comptabilité
  canViewAccounting: boolean;
  canManageExpenses: boolean;
  canManageSalaries: boolean;

  // Consignations
  canCreateConsignment: boolean;
  canClaimConsignment: boolean;
  canViewConsignments: boolean;

  // Paramètres
  canManageSettings: boolean;
  canManageBarInfo: boolean;

  // Multi-bar
  canCreateBars: boolean;
  canSwitchBars: boolean;

  // Super Admin (permissions spéciales)
  canAccessAdminDashboard?: boolean;
  canManagePromoteurs?: boolean;
  canImpersonateUsers?: boolean;
  canViewGlobalStats?: boolean;
  canSuspendBars?: boolean;
}

export const ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {
  super_admin: {
    // Toutes les permissions (super utilisateur)
    canManageUsers: true,
    canCreateManagers: true,
    canCreateServers: true,
    canAddProducts: true,
    canEditProducts: true,
    canDeleteProducts: true,
    canManageInventory: true,
    canViewInventory: true,
    canSell: true,
    canCancelSales: true,
    canViewAllSales: true,
    canViewOwnSales: true,
    canViewAnalytics: true,
    canExportData: true,
    canViewAccounting: true,
    canManageExpenses: true,
    canManageSalaries: true,
    canCreateConsignment: true,
    canClaimConsignment: true,
    canViewConsignments: true,
    canManageSettings: true,
    canManageBarInfo: true,
    canCreateBars: true,
    canSwitchBars: true,
    // Permissions spéciales Super Admin
    canAccessAdminDashboard: true,
    canManagePromoteurs: true,
    canImpersonateUsers: true,
    canViewGlobalStats: true,
    canSuspendBars: true,
  },
  promoteur: {
    canManageUsers: true,
    canCreateManagers: true,
    canCreateServers: true,
    canAddProducts: true,
    canEditProducts: true,
    canDeleteProducts: true,
    canManageInventory: true,
    canViewInventory: true,
    canSell: true,
    canCancelSales: true,
    canViewAllSales: true,
    canViewOwnSales: true,
    canViewAnalytics: true,
    canExportData: true,
    canViewAccounting: true,
    canManageExpenses: true,
    canManageSalaries: true,
    canCreateConsignment: true,
    canClaimConsignment: true,
    canViewConsignments: true,
    canManageSettings: true,
    canManageBarInfo: true,
    canCreateBars: true,
    canSwitchBars: true,
  },
  gerant: {
    canManageUsers: false,
    canCreateManagers: false,
    canCreateServers: true,
    canAddProducts: true,
    canEditProducts: true,
    canDeleteProducts: true,
    canManageInventory: true,
    canViewInventory: true,
    canSell: true,
    canCancelSales: true,
    canViewAllSales: true,
    canViewOwnSales: true,
    canViewAnalytics: true,
    canExportData: true,
    canViewAccounting: false,
    canManageExpenses: false,
    canManageSalaries: false,
    canCreateConsignment: true,
    canClaimConsignment: true,
    canViewConsignments: true,
    canManageSettings: true,
    canManageBarInfo: true,
    canCreateBars: false,
    canSwitchBars: false,
  },
  serveur: {
    canManageUsers: false,
    canCreateManagers: false,
    canCreateServers: false,
    canAddProducts: false,
    canEditProducts: false,
    canDeleteProducts: false,
    canManageInventory: false,
    canViewInventory: false,
    canSell: true,
    canCancelSales: false,
    canViewAllSales: false,
    canViewOwnSales: true,
    canViewAnalytics: false,
    canExportData: false,
    canViewAccounting: false,
    canManageExpenses: false,
    canManageSalaries: false,
    canCreateConsignment: false,
    canClaimConsignment: false,
    canViewConsignments: false,
    canManageSettings: false,
    canManageBarInfo: false,
    canCreateBars: false,
    canSwitchBars: false,
  }
};

// ===== PARAMÈTRES APPLICATION =====
export interface AppSettings {
  currency: string;
  currencySymbol: string;
  currentSession: UserSession | null;
  consignmentExpirationDays?: number; // Nombre de jours avant expiration consignation (défaut: 7)
}

// ===== HELPERS =====
export const getPermissionsByRole = (role: UserRole): RolePermissions => {
  return ROLE_PERMISSIONS[role];
};

// ===== ADMIN NOTIFICATIONS (A.5) =====
export type NotificationType =
  // Problèmes Métier Critiques
  | 'negative_stock'           // Stock négatif détecté
  | 'high_return_rate'         // Taux de retours > 15%
  | 'unpaid_salaries'          // Salaires non payés > 30j
  | 'zero_revenue_active'      // Bar actif mais 0 CA depuis 7j
  | 'consignment_expired_high' // > 20 consignations expirées
  | 'no_products'              // Bar sans produits créés
  | 'single_user_bar'          // Bar avec 1 seul membre
  // Anomalies Techniques
  | 'sync_queue_blocked'       // Queue sync > 50 ops
  | 'data_corruption'          // Données incohérentes
  | 'localstorage_full'        // localStorage > 90%
  | 'large_sale_anomaly'       // Vente > 500k FCFA
  // Opportunités Business
  | 'high_performer'           // CA > 1M FCFA sur 30j
  | 'ready_for_billing'        // Bar actif > 3 mois
  | 'new_bar_success';         // Nouveau bar avec 50+ ventes

export type NotificationPriority = 'high' | 'medium' | 'info';

export interface AdminNotification {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  barId: string;
  barName: string;
  title: string;
  message: string;
  timestamp: Date;
  isRead: boolean;
  isResolved: boolean;        // Marquer comme résolu
  metadata?: Record<string, any>; // Données contextuelles (productId, stock, etc.)
  actions?: string[];         // IDs actions disponibles ('fix_stock', 'view_stats', etc.)
}

// ===== AUDIT LOGS =====
export type AuditLogEvent =
  // Bar Management
  | 'BAR_CREATED'
  | 'BAR_UPDATED'
  | 'BAR_SUSPENDED'
  | 'BAR_ACTIVATED'
  | 'BAR_DELETED'
  // User Management
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_DELETED'
  | 'USER_SUSPENDED'
  | 'USER_ACTIVATED'
  | 'PASSWORD_RESET'
  // Authentication
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'IMPERSONATE_START'
  | 'IMPERSONATE_STOP'
  // Products & Inventory
  | 'PRODUCT_CREATED'
  | 'PRODUCT_UPDATED'
  | 'PRODUCT_DELETED'
  | 'PRODUCTS_BULK_DELETED'
  | 'SUPPLY_CREATED'
  | 'STOCK_ADJUSTED'
  // Sales & Returns
  | 'SALE_CREATED'
  | 'SALE_DELETED'
  | 'RETURN_CREATED'
  | 'RETURN_PROCESSED'
  // Accounting
  | 'EXPENSE_CREATED'
  | 'EXPENSE_DELETED'
  | 'SALARY_PAID'
  | 'SALARY_DELETED'
  // System
  | 'DATA_EXPORTED'
  | 'DATA_IMPORTED'
  | 'BACKUP_CREATED'
  | 'SETTINGS_UPDATED'
  | 'SYNC_FAILED'
  | 'SYNC_SUCCESS';

export type AuditLogSeverity = 'info' | 'warning' | 'critical';

export interface AuditLog {
  id: string;
  timestamp: Date;
  event: AuditLogEvent;
  severity: AuditLogSeverity;
  userId: string;
  userName: string;
  userRole: UserRole;
  barId?: string;
  barName?: string;
  ipAddress?: string;
  userAgent?: string;
  description: string;
  metadata?: Record<string, any>;
  relatedEntityId?: string;
  relatedEntityType?: 'bar' | 'user' | 'product' | 'sale' | 'expense';
}