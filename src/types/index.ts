// types/index.ts - VERSION UNIFIÉE MULTI-TENANT

// ===== UTILISATEURS & AUTHENTIFICATION =====
export type UserRole = 'promoteur' | 'gerant' | 'serveur';

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
}

export interface BarMember {
  id: string;
  userId: string;
  barId: string;
  role: UserRole;
  assignedBy: string;
  assignedAt: Date;
  isActive: boolean;
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

// ===== COMPTABILITÉ =====
export type TransactionType =
  | 'sale'           // Vente
  | 'return'         // Retour
  | 'supply'         // Approvisionnement
  | 'expense'        // Dépense
  | 'salary'         // Salaire
  | 'consignment';   // Consignation (neutre en trésorerie, déjà payé)

export type ExpenseCategory =
  | 'supply'         // 📦 Approvisionnements (auto-généré)
  | 'water'          // 💧 Eau
  | 'electricity'    // ⚡ Électricité
  | 'maintenance'    // 🔧 Entretien/Réparations
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
  notes?: string;
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

export interface Order {
  id: string;
  barId: string; // ✅ Tous les types incluent barId
  items: CartItem[];
  total: number;
  currency: string;
  status: 'en attente' | 'servi' | 'annulé';
  tableNumber?: string;
  createdBy: string;
  date: Date;
  completedAt?: Date;
}

export interface Sale {
  id: string;
  barId: string; // ✅ Tous les types incluent barId
  items: CartItem[];
  total: number;
  currency: string;
  date: Date;
  orderId?: string;
  processedBy: string; // Qui a enregistré la vente (userId)
  assignedTo?: string; // En mode simplifié : nom du serveur qui a servi (ex: "Marie")
}

// ===== RETOURS =====
export type ReturnReason = 'defective' | 'wrong_item' | 'customer_change' | 'expired' | 'other';

export interface ReturnReasonConfig {
  label: string;
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
}

export const ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {
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
    canManageSettings: false,
    canManageBarInfo: false,
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