// types/index.ts - VERSION UNIFIÉE MULTI-TENANT

// ===== UTILISATEURS & AUTHENTIFICATION =====
export type UserRole = 'super_admin' | 'promoteur' | 'gerant' | 'serveur';

export interface User {
  id: string;
  username: string;
  name: string;
  phone: string;
  email?: string;
  createdAt: Date;
  createdBy?: string;
  isActive: boolean;
  firstLogin: boolean;
  avatarUrl?: string;
  lastLoginAt?: Date;
  role: UserRole;
  hasCompletedOnboarding?: boolean;
  onboardingCompletedAt?: Date;
  trainingVersionCompleted?: number;
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
  hasCompletedOnboarding?: boolean; // New: Track if user has completed training
  allbarIds?: string[]; // Ajout de la propriété (optionnelle ou obligatoire)
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
  closingHour: number;
  settings: BarSettings;
  isSetupComplete?: boolean;
  theme_config?: any; // Configuration du thème (jsonb)
}

export interface BarSettings {
  currency: string;
  currencySymbol: string;
  timezone?: string;
  language?: string;
  // Heure de clôture déplacée au niveau Bar (closingHour)
  taxRate?: number; // Pourcentage TVA (ex: 18)
  operatingMode?: 'full' | 'simplified'; // Mode de fonctionnement : complet (avec comptes serveurs) ou simplifié (gérant attribue)
  plan?: 'starter' | 'pro' | 'enterprise'; // Plan d'utilisation (contrôle membres, features, dataTier)
  dataTier?: 'lite' | 'balanced' | 'enterprise'; // Stratégie de chargement des données (dérivé du plan)
  serversList?: string[]; // Liste des serveurs (mode simplifié uniquement)
  consignmentExpirationDays?: number; // Nombre de jours avant expiration consignation (défaut: 7)
  supplyFrequency?: number; // Fréquence d'approvisionnement en jours (1-30, défaut: 7)
  costDisplayMethod?: 'cump' | 'last_cost'; // Méthode d'affichage du coût en inventaire (défaut: 'cump')
  // Identifiants légaux (obligatoires pour l'en-tête du Livre Journal SYSCOHADA)
  rccm?: string;  // Registre du Commerce et du Crédit Mobilier
  ifu?: string;   // Identifiant Fiscal Unique (NINEA au Sénégal, IFU au Bénin/Burkina)
  accounting?: {  // Configuration du module comptable
    tvaActive?: boolean;
    tvaRate?: number;
    customCategoryMappings?: Record<string, string>;
  };
  [key: string]: unknown; // Allow extra dynamic settings
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
  globalProductId?: string;
  isCustomProduct?: boolean;
  currentAverageCost?: number; // ✨ CUMP (Coût Unitaire Moyen Pondéré) - Updated when supplies arrive
  initialUnitCost?: number; // Coût unitaire initial saisi manuellement (fallback quand aucun supply)
  lastUnitCost?: number; // Dernier coût unitaire d'approvisionnement (UX only — cache DB)
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
  productName?: string; // ✨ Pour l'affichage
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

// ===== AUDIT LOG POUR CATALOGUE GLOBAL =====
export type GlobalCatalogAuditAction = 'CREATE' | 'UPDATE' | 'DELETE';
export type GlobalCatalogAuditEntityType = 'PRODUCT' | 'CATEGORY';

export interface GlobalCatalogAuditLog {
  id: string;
  action: GlobalCatalogAuditAction;
  entityType: GlobalCatalogAuditEntityType;
  entityId: string;
  entityName: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  modifiedBy: string; // User ID
  modifiedByName?: string; // User name for display
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
  memberName?: string; // ✨ Pour l'affichage
  staffName?: string; // ✨ Alias pour compatibilité
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
  amount: number;         // Positif = entrée, Négatif = sortie
  paymentMethod?: string; // Mode de paiement (ex: cash, mobile_money, card, credit, ticket)
  category?: string;      // Catégorie pour les dépenses (ex: water, electricity, investment)
  date: Date;             // Timestamp réel de l'opération
  businessDate?: Date;    // Journée fiscale du bar (chevauche deux jours calendaires pour les bars nocturnes)
                          // Ex: une vente à 2h du matin samedi → businessDate = vendredi
                          // Utilisé pour le Z de Caisse. Si absent, `date` est utilisé par défaut.
  referenceId?: string;   // ID de la vente/retour/approv/dépense/salaire
  description: string;
  createdBy: string;
  createdAt: Date;
}

// ===== VENTES & COMMANDES =====
export interface CartItem {
  product: Product;
  quantity: number;
  returned?: number;
  // Champs pour les promotions
  originalPrice?: number;    // Prix unitaire original avant promo
  discountAmount?: number;   // Montant de la réduction totale
  promotionId?: string;      // ID de la promotion appliquée
}

export interface SaleItem {
  product_id: string;
  product_name: string;
  product_volume?: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  original_unit_price?: number;
  discount_amount?: number;
  promotion_id?: string;
  promotion_type?: PromotionType;
  promotion_name?: string;
}

export interface Sale {
  id: string;
  barId: string;
  items: SaleItem[];
  total: number;
  currency: string;

  // Le cycle de vie de la vente pour la validation par le gérant
  status: 'pending' | 'validated' | 'rejected' | 'cancelled';

  // Traçabilité des actions
  createdBy: string;      // ID de qui a créé la vente (audit technique)
  soldBy: string;         // ID du vendeur (source de vérité métier)
  serverId?: string;      // ✨ NOUVEAU: UUID du serveur assigné (mode switching support)
  ticketId?: string;      // FK vers tickets — null = "sans bon"
  validatedBy?: string;   // ID du gérant qui a validé et sorti le stock
  rejectedBy?: string;    // ID du gérant qui a rejeté la demande

  // Timestamps pour l'audit
  createdAt: Date | string;        // Date de création par le serveur
  validatedAt?: Date | string;     // Date de validation par le gérant
  rejectedAt?: Date | string;      // Date de rejet par le gérant
  cancelledBy?: string;   // ID de qui a annulé la vente validée
  cancelledAt?: Date | string;     // Timestamp de l'annulation
  cancelReason?: string;  // Raison libre fournie par l'annuleur

  // ✅ NOUVEAU : Date commerciale (synchronisée avec DB)
  businessDate: Date | string;

  // Optionnel, pour le mode simplifié ou pour référence
  assignedTo?: string;    // En mode simplifié : nom du serveur qui a servi (ex: "Marie")
  tableNumber?: string;   // Numéro de la table si applicable
  // Informations complémentaires
  paymentMethod?: 'cash' | 'mobile_money' | 'card' | 'credit' | 'ticket';
  customerName?: string;
  customerPhone?: string;
  onboarding_step?: string;
  theme_config?: string; // JSON stringifié
  notes?: string; // ✨ Notes sur la vente
  idempotencyKey?: string; // 🛡️ Clé anti-doublon (V11.5)
  isOptimistic?: boolean; // ⭐ Indique une vente créée hors-ligne (UI Optimiste)
  sourceReturnId?: string; // 🔄 ID du retour qui a financé cet échange (Magic Swap)
}

// ===== TICKETS (BONS) =====
export interface Ticket {
  id: string;
  barId: string;
  status: 'open' | 'paid';
  createdBy: string;
  serverId?: string;
  createdAt: Date;
  paidAt?: Date;
  paidBy?: string;
  notes?: string;
  ticketNumber?: number; // ✨ NOUVEAU: Numéro séquentiel (1, 2, 3...)
  paymentMethod?: string; // ✨ NOUVEAU: Moteur de paiement du bon
  tableNumber?: number; // ✨ NOUVEAU: Numéro de table (optionnel)
  customerName?: string; // ✨ NOUVEAU: Nom du client (optionnel)
}

// ===== AJUSTEMENTS DE STOCK =====
export type AdjustmentReason =
  | 'inventory_count'
  | 'loss_damage'
  | 'donation_sample'
  | 'expiration'
  | 'theft_report'
  | 'other';

export interface AdjustmentReasonConfig {
  label: string;
  description: string;
  icon: string;
  color: string;
  requiresNotes: boolean;
}

export const ADJUSTMENT_REASONS: Record<AdjustmentReason, AdjustmentReasonConfig> = {
  inventory_count: {
    label: 'Inventaire physique',
    description: 'Correction suite à comptage physique',
    icon: 'ClipboardList',
    color: 'blue',
    requiresNotes: false
  },
  loss_damage: {
    label: 'Perte / Dégât',
    description: 'Produit endommagé ou cassé',
    icon: 'AlertTriangle',
    color: 'orange',
    requiresNotes: false
  },
  donation_sample: {
    label: 'Don / Dégustation',
    description: 'Offert aux clients ou dégustation staff',
    icon: 'Gift',
    color: 'green',
    requiresNotes: false
  },
  expiration: {
    label: 'Expiration',
    description: 'Produit expiré ou périmé',
    icon: 'Calendar',
    color: 'red',
    requiresNotes: false
  },
  theft_report: {
    label: 'Déclaration vol',
    description: 'Vol détecté en inventaire',
    icon: 'AlertCircle',
    color: 'red',
    requiresNotes: true
  },
  other: {
    label: 'Autre',
    description: 'Autre raison (notes obligatoires)',
    icon: 'MoreHorizontal',
    color: 'gray',
    requiresNotes: true
  }
};

export interface StockAdjustment {
  id: string;
  barId: string;
  productId: string;
  oldStock: number;
  newStock: number;
  delta: number;
  reason: AdjustmentReason;
  notes?: string;
  adjustedBy: string;
  adjustedAt: Date;
  createdAt: Date;
}

// ===== RETOURS =====
export type ReturnReason = 'defective' | 'wrong_item' | 'customer_change' | 'expired' | 'exchange' | 'other';

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
  serverId?: string;  // ✨ NOUVEAU: UUID du serveur assigné (mode switching support)
  returnedAt: Date;
  businessDate: Date | string; // ✅ NOUVEAU : Date commerciale (synchronisée avec DB) - string YYYY-MM-DD preferred
  refundAmount: number;
  isRefunded: boolean; // ✅ Le client a-t-il été remboursé ?
  status: 'pending' | 'approved' | 'validated' | 'rejected' | 'restocked';
  autoRestock: boolean;
  manualRestockRequired: boolean;
  restockedAt?: Date;
  notes?: string;

  // ✅ NOUVEAU : Choix custom pour motif "other"
  customRefund?: boolean;   // Décision manuelle gérant : rembourser ?
  customRestock?: boolean;  // Décision manuelle gérant : remettre en stock ?

  // ✅ NOUVEAU : Traçabilité vendeur original
  originalSeller?: string;  // userId du vendeur qui a créé la vente originale

  // ✅ NOUVEAU : Traçabilité validation/rejet
  validatedBy?: string;     // userId du gérant qui a approuvé
  rejectedBy?: string;      // userId du gérant qui a rejeté

  // ✨ NOUVEAU : Mode opérationnel à la création (pour gérer le switching de mode)
  operatingModeAtCreation?: 'full' | 'simplified'; // Mode lors de la création du retour
  business_date?: string; // ✅ Alias snake_case pour compatibility filtrage
  server_id?: string; // Alias snake_case pour compatibility DB
  validated_by?: string; // Alias snake_case
  rejected_by?: string; // Alias snake_case
  linkedSaleId?: string; // 🔄 ID de la vente de remplacement (Magic Swap)
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
  createdAt: Date | string;                // Date consignation
  expiresAt: Date | string;                // Date expiration (7-30j configurable)
  claimedAt?: Date | string;               // Date récupération
  businessDate: Date | string;            // ✅ NOUVEAU : Date commerciale (synchronisée avec DB)

  // Statut
  status: ConsignmentStatus;

  // Traçabilité
  createdBy: string;              // userId qui a créé la consignation
  claimedBy?: string;             // userId qui a validé la récupération
  serverId?: string;              // ✨ NOUVEAU: UUID du serveur assigné (mode switching support)
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
  canViewForecasting: boolean; // ✨ NEW: Permission pour voir les prévisions IA

  // Comptabilité
  canViewAccounting: boolean;
  canManageExpenses: boolean;
  canManageSalaries: boolean;

  // Consignations
  canCreateConsignment: boolean;
  canClaimConsignment: boolean;
  canViewConsignments: boolean;

  // Promotions (NEW)
  canManagePromotions: boolean;

  // Paramètres
  canManageSettings: boolean;
  canManageBarInfo: boolean;

  // Multi-bar
  canCreateBars: boolean;
  canSwitchBars: boolean;

  // Super Admin (permissions spéciales)
  canAccessAdminDashboard?: boolean;
  canManagePromoteurs?: boolean;
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
    canViewForecasting: true,
    canViewAccounting: true,
    canManageExpenses: true,
    canManageSalaries: true,
    canCreateConsignment: true,
    canClaimConsignment: true,
    canViewConsignments: true,
    canManagePromotions: true, // NEW
    canManageSettings: true,
    canManageBarInfo: true,
    canCreateBars: true,
    canSwitchBars: true,
    // Permissions spéciales Super Admin
    canAccessAdminDashboard: true,
    canManagePromoteurs: true,
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
    canViewForecasting: true,
    canViewAccounting: true,
    canManageExpenses: true,
    canManageSalaries: true,
    canCreateConsignment: true,
    canClaimConsignment: true,
    canViewConsignments: true,
    canManagePromotions: true, // NEW
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
    canCancelSales: false,
    canViewAllSales: true,
    canViewOwnSales: true,
    canViewAnalytics: true,
    canExportData: true,
    canViewForecasting: true,
    canViewAccounting: false,
    canManageExpenses: false,
    canManageSalaries: false,
    canCreateConsignment: true,
    canClaimConsignment: true,
    canViewConsignments: true,
    canManagePromotions: true, // NEW
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
    canViewForecasting: false,
    canViewAccounting: false,
    canManageExpenses: false,
    canManageSalaries: false,
    canCreateConsignment: false,
    canClaimConsignment: false,
    canViewConsignments: false,
    canManagePromotions: false, // NEW
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
  | 'MEMBER_ADDED'
  | 'BAR_SWITCHED'
  // User Management
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_DELETED'
  | 'USER_SUSPENDED'
  | 'USER_ACTIVATED'
  | 'PASSWORD_RESET'
  | 'PASSWORD_RESET_REQUESTED'
  | 'PASSWORD_RESET_REQUEST_FAILED'
  // Authentication
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
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
  | 'SALE_CANCELLED'
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

// ===== PROMOTIONS =====

/**
 * Type de promotion
 */
export type PromotionType =
  // Types français (nouveaux)
  | 'lot'                // Lot : X unités à prix fixe (ex: 3 bières à 1000 FCFA)
  | 'reduction_vente'    // Réduction fixe sur la vente totale (ex: -50 FCFA)
  | 'pourcentage'        // Réduction pourcentage (ex: -10%)
  | 'prix_special'       // Prix spécial avec horaires optionnels (ex: Happy Hour)
  | 'reduction_produit'  // Réduction par unité × quantité (ex: -20 FCFA/unité)
  | 'majoration_produit' // Majoration par unité × quantité (ex: +30 FCFA/unité)
  // Types anglais (anciens, rétro-compatibilité)
  | 'bundle'
  | 'fixed_discount'
  | 'percentage'
  | 'special_price';

/**
 * Statut d'une promotion
 */
export type PromotionStatus =
  | 'draft'      // Brouillon (non visible clients)
  | 'scheduled'  // Programmée (pas encore active)
  | 'active'     // Active (visible et applicable)
  | 'paused'     // En pause (temporairement désactivée)
  | 'expired'    // Expirée (date fin dépassée)
  | 'cancelled'; // Annulée (définitivement)

/**
 * Type de ciblage d'une promotion
 */
export type PromotionTargetType =
  | 'product'   // Produits spécifiques
  | 'category'  // Catégories spécifiques
  | 'all';      // Tous les produits

/**
 * Promotion commerciale
 */
export interface Promotion {
  id: string;
  barId: string;

  // Informations générales
  name: string;
  description?: string;
  type: PromotionType;
  status: PromotionStatus;

  // Ciblage
  targetType: PromotionTargetType;
  targetProductIds?: string[];
  targetCategoryIds?: string[];

  // Configuration BUNDLE (ex: 3 bières à 1000 FCFA)
  bundleQuantity?: number;
  bundlePrice?: number;

  // Configuration FIXED_DISCOUNT (ex: -50 FCFA)
  discountAmount?: number;

  // Configuration PERCENTAGE (ex: -10%)
  discountPercentage?: number;

  // Configuration SPECIAL_PRICE (ex: Bière à 300 FCFA)
  specialPrice?: number;
  timeStart?: string;  // Format: 'HH:MM' (ex: '17:00')
  timeEnd?: string;    // Format: 'HH:MM' (ex: '19:00')

  // Planification temporelle
  startDate: string;   // Format: 'YYYY-MM-DD'
  endDate?: string;    // Format: 'YYYY-MM-DD'
  isRecurring: boolean;
  recurrenceDays?: number[];  // [0-6] : 0=Dimanche, 1=Lundi, ..., 6=Samedi

  // Limites d'utilisation
  maxUsesPerCustomer?: number;
  maxTotalUses?: number;
  currentUses: number;

  // Priorité (si plusieurs promos applicables)
  priority: number;

  // Traçabilité
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Application d'une promotion à une vente (historique)
 */
export interface PromotionApplication {
  id: string;
  barId: string;
  promotionId: string;
  saleId: string;
  productId: string;
  quantitySold: number;
  originalPrice: number;
  discountedPrice: number;
  discountAmount: number;
  appliedAt: Date;
  appliedBy: string;
}

/**
 * Résultat du calcul de prix avec promotion
 */
export interface PromotionPriceResult {
  finalPrice: number;
  originalPrice: number;
  discount: number;
  appliedPromotion?: Promotion;
}

// ===== ÉVÉNEMENTS =====

/**
 * Type d'événement
 */
export type EventType =
  | 'holiday'      // Jour férié (Nouvel An, Noël, etc.)
  | 'anniversary'  // Anniversaire bar
  | 'sports'       // Événement sportif (match important)
  | 'theme_night'  // Soirée thématique
  | 'custom';      // Personnalisé

/**
 * Événement spécial impactant les ventes
 */
export interface BarEvent {
  id: string;
  barId: string;
  eventType: EventType;
  eventName: string;
  eventDate: string;  // Format: 'YYYY-MM-DD'
  impactMultiplier: number;  // 1.5 = +50%, 2.0 = +100%
  isRecurring: boolean;
  recurrenceRule?: string;  // Format: 'yearly_12_25', 'monthly_15', 'weekly_5'
  notes?: string;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}
// ===== DATE FILTERS (FILTRES TEMPORELS) =====
export * from './dateFilters';
