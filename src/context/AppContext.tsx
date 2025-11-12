import React, { createContext, useContext, useCallback, useEffect } from 'react';
import { useDataStore } from '../hooks/useDataStore';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { useStockBridge } from '../context/StockBridgeProvider';
import { useStock } from '../context/StockContext';
import { syncQueue } from '../services/SyncQueue';
import { useNotifications } from '../components/Notifications';
import { auditLogger } from '../services/AuditLogger';
import {
  Category,
  Product,
  Supply,
  Sale,
  CartItem,
  AppSettings,
  Return,
  User,
  Expense,
  ExpenseCategoryCustom,
} from '../types';
import { getBusinessDay, getCurrentBusinessDay, isSameDay } from '../utils/businessDay';
import type { MutationType } from '../types/sync';

// Données par défaut pour un nouveau bar - Catégories uniquement (SINGULIER)
const getDefaultCategories = (barId: string): Category[] => [
  { id: `${barId}_cat_1`, barId, name: 'Bière', color: '#f59e0b', createdAt: new Date() },
  { id: `${barId}_cat_2`, barId, name: 'Sucrerie', color: '#ef4444', createdAt: new Date() },
  { id: `${barId}_cat_3`, barId, name: 'Liqueur', color: '#8b5cf6', createdAt: new Date() },
  { id: `${barId}_cat_4`, barId, name: 'Vin', color: '#dc2626', createdAt: new Date() },
];

const defaultSettings: AppSettings = {
  currency: 'FCFA',
  currencySymbol: ' FCFA',
  currentSession: null,
};

interface AppContextType {
  // État
  categories: Category[];
  products: Product[];
  supplies: Supply[];
  sales: Sale[];
  settings: AppSettings;
  users: User[]; // Ajouté pour le mapping ID -> Nom
  
  // Catégories
  addCategory: (category: Omit<Category, 'id' | 'createdAt' | 'barId'>) => Category | null;
  addCategories: (categories: Omit<Category, 'id' | 'createdAt' | 'barId'>[]) => Category[];
  updateCategory: (id: string, updates: Partial<Category>) => void;
  deleteCategory: (id: string) => void;

  // Produits (lecture seule - mutations via StockContext)
  getProductsByCategory: (categoryId: string) => Product[];
  getLowStockProducts: () => Product[];
  getProductById: (id: string) => Product | undefined;

  // Approvisionnements (addSupply removed - use useStockManagement.processSupply)
  getSuppliesByProduct: (productId: string) => Supply[];
  getTotalCostByProduct: (productId: string) => number;
  getAverageCostPerUnit: (productId: string) => number;
  
  // Ventes (Nouveau workflow)
  addSale: (saleData: Partial<Sale>) => Sale | null;
  validateSale: (saleId: string, validatorId: string) => void;
  rejectSale: (saleId: string, rejectorId: string) => void;
  getSalesByDate: (startDate: Date, endDate: Date) => Sale[];
  getTodaySales: () => Sale[];
  getTodayTotal: () => number;
  getSalesByUser: (userId: string) => Sale[];
  getServerRevenue: (userId: string, startDate?: Date, endDate?: Date) => number;
  getServerReturns: (userId: string) => Return[];

  // Retours
  returns: Return[];
  addReturn: (returnData: Omit<Return, 'id' | 'barId'>) => Return | null;
  updateReturn: (returnId: string, updates: Partial<Return>) => void;
  deleteReturn: (returnId: string) => void;
  getReturnsBySale: (saleId: string) => Return[];
  getPendingReturns: () => Return[];

  // Dépenses
  expenses: Expense[];
  customExpenseCategories: ExpenseCategoryCustom[];
  addExpense: (expenseData: Omit<Expense, 'id' | 'barId' | 'createdAt'>) => Expense | null;
  deleteExpense: (expenseId: string) => void;
  addCustomExpenseCategory: (name: string, icon: string, createdBy: string) => ExpenseCategoryCustom | null;

  // Paramètres
  updateSettings: (updates: Partial<AppSettings>) => void;

  // Initialisation
  initializeBarData: (barId: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentSession, hasPermission } = useAuth();
  const { currentBar } = useBarContext();
  const { showNotification } = useNotifications();
  const { processSaleValidation } = useStockBridge();

  // ✅ Utiliser StockContext pour products et supplies (source unique)
  const { products: allProducts, supplies: allSupplies } = useStock();

  // États avec tous les bars (sauf products/supplies → délégués à StockContext)
  const [allCategories, setAllCategories] = useDataStore<Category[]>('categories-v3', []);
  const [allSales, setAllSales] = useDataStore<Sale[]>('sales-v3', []);
  const [allReturns, setAllReturns] = useDataStore<Return[]>('returns-v1', []);
  const [allExpenses, setAllExpenses] = useDataStore<Expense[]>('expenses-v1', []);
  const [allCustomExpenseCategories, setAllCustomExpenseCategories] = useDataStore<ExpenseCategoryCustom[]>('expense-categories-v1', []);
  const [settings, setSettings] = useDataStore<AppSettings>('app-settings-v3', defaultSettings);
  const [users, setUsers] = useDataStore<User[]>('bar-users', []); // Synchronisé avec AuthContext et BarContext

  // Filtrage automatique par bar actuel
  const categories = allCategories.filter(c => c.barId === currentBar?.id);
  const products = allProducts.filter(p => p.barId === currentBar?.id);
  const supplies = allSupplies.filter(s => s.barId === currentBar?.id);
  const sales = allSales.filter(s => s.barId === currentBar?.id);
  const returns = allReturns.filter(r => r.barId === currentBar?.id);
  const expenses = allExpenses.filter(e => e.barId === currentBar?.id);
  const customExpenseCategories = allCustomExpenseCategories.filter(c => c.barId === currentBar?.id);

  const initializeBarData = useCallback((barId: string) => {
    const existingCategories = allCategories.some(c => c.barId === barId);
    if (!existingCategories) {
      const defaultCategories = getDefaultCategories(barId);

      // ✅ Ajouter uniquement les catégories (pas de produits par défaut)
      // Le promoteur ajoutera ses propres produits via l'interface ou import Excel
      setAllCategories(prev => [...prev, ...defaultCategories]);

      console.log(`✅ Bar ${barId}: 4 catégories créées (${defaultCategories.map(c => c.name).join(', ')})`);
    }
  }, [allCategories, setAllCategories]);

  // ⚠️ FONCTION LEGACY - Préférer addCategories pour créations multiples (évite race condition)
  const addCategory = useCallback((category: Omit<Category, 'id' | 'createdAt' | 'barId'>) => {
    if (!hasPermission('canAddProducts')) return null;
    if (!currentBar) return null;

    const newCategory: Category = {
      ...category,
      id: `cat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      barId: currentBar.id,
      createdAt: new Date(),
    };

    setAllCategories(prev => [...prev, newCategory]);
    return newCategory;
  }, [setAllCategories, hasPermission, currentBar]);

  // ✅ Ajouter plusieurs catégories en UNE SEULE opération (évite race condition)
  const addCategories = useCallback((categories: Omit<Category, 'id' | 'createdAt' | 'barId'>[]): Category[] => {
    if (!hasPermission('canAddProducts')) {
      return [];
    }

    if (!currentBar) {
      return [];
    }

    const newCategories = categories.map((cat, index) => ({
      ...cat,
      id: `cat_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
      barId: currentBar.id,
      createdAt: new Date(),
    }));

    // ✅ UNE SEULE opération setState (pas de race condition)
    setAllCategories(prev => [...prev, ...newCategories]);

    return newCategories;
  }, [setAllCategories, hasPermission, currentBar]);

  const updateCategory = useCallback((id: string, updates: Partial<Category>) => {
    if (!hasPermission('canEditProducts')) return;
    setAllCategories(prev => prev.map(cat => cat.id === id ? { ...cat, ...updates } : cat));
  }, [setAllCategories, hasPermission]);

  const deleteCategory = useCallback((id: string) => {
    if (!hasPermission('canDeleteProducts')) return;

    const categoryToDelete = categories.find(c => c.id === id);
    if (!categoryToDelete) return;

    const isCategoryInUse = products.some(product => product.categoryId === id);

    if (isCategoryInUse) {
      showNotification('error', `Impossible de supprimer la catégorie "${categoryToDelete.name}" car elle contient des produits. Pour continuer, vous devez d'abord soit déplacer ces produits dans une autre catégorie, soit les supprimer définitivement.`);
      return;
    }

    if (window.confirm(`Êtes-vous sûr de vouloir supprimer la catégorie "${categoryToDelete.name}" ? Cette action est irréversible.`)) {
      setAllCategories(prev => prev.filter(cat => cat.id !== id));
      showNotification('success', `La catégorie "${categoryToDelete.name}" a été supprimée.`);
    }
  }, [products, categories, setAllCategories, hasPermission, showNotification]);

  // ❌ REMOVED: addProduct, updateProduct, deleteProduct
  // → Use StockContext (useStock) for all product mutations
  // ❌ REMOVED: decreaseStock, increaseStock
  // → Use useStockManagement.decreasePhysicalStock/increasePhysicalStock

  const getProductsByCategory = useCallback((categoryId: string) => products.filter(p => p.categoryId === categoryId), [products]);
  const getLowStockProducts = useCallback(() => products.filter(p => p.stock <= p.alertThreshold), [products]);
  const getProductById = useCallback((id: string) => products.find(p => p.id === id), [products]);

  // ❌ REMOVED: addSupply - Use useStockManagement.processSupply

  const getSuppliesByProduct = useCallback((productId: string) => supplies.filter(s => s.productId === productId), [supplies]);

  const getTotalCostByProduct = useCallback((productId: string) => {
    return getSuppliesByProduct(productId).reduce((sum, supply) => sum + supply.totalCost, 0);
  }, [getSuppliesByProduct]);

  const getAverageCostPerUnit = useCallback((productId: string) => {
    const productSupplies = getSuppliesByProduct(productId);
    const totalCost = productSupplies.reduce((sum, supply) => sum + supply.totalCost, 0);
    const totalQuantity = productSupplies.reduce((sum, supply) => sum + supply.quantity, 0);
    return totalQuantity > 0 ? totalCost / totalQuantity : 0;
  }, [getSuppliesByProduct]);

  // ===== NOUVEAU WORKFLOW DE VENTES =====

  const addSale = useCallback((saleData: Partial<Sale>) => {
    if (!hasPermission('canSell') || !currentBar || !currentSession) return null;

    const uniqueId = `sale_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newSale: Sale = {
      id: uniqueId,
      barId: currentBar.id,
      ...saleData,
    } as Sale;

    // 1. Optimistic update: sauvegarder localement immédiatement
    setAllSales(prev => [newSale, ...prev]);

    // 2. Enqueue pour sync backend
    syncQueue.enqueue('CREATE_SALE', newSale, currentBar.id, currentSession.userId);

    // 3. Log création vente
    auditLogger.log({
      event: 'SALE_CREATED',
      severity: 'info',
      userId: currentSession.userId,
      userName: currentSession.userName,
      userRole: currentSession.role,
      barId: currentBar.id,
      barName: currentBar.name,
      description: `Vente créée: ${newSale.total} FCFA (${newSale.items.length} produits)`,
      metadata: {
        saleId: newSale.id,
        saleTotal: newSale.total,
        saleStatus: newSale.status,
        itemsCount: newSale.items.length,
        serverId: newSale.serverId,
      },
      relatedEntityId: newSale.id,
      relatedEntityType: 'sale',
    });

    if (newSale.status === 'pending') {
      showNotification('success', 'Demande de vente envoyée au gérant pour validation.');
    } else if (newSale.status === 'validated') {
      showNotification('success', 'Vente enregistrée et stock mis à jour.');
    }

    return newSale;
  }, [setAllSales, hasPermission, currentBar, currentSession, showNotification]);

  const validateSale = useCallback((saleId: string, validatorId: string) => {
    if (!hasPermission('canManageInventory')) return; // Seul un gérant peut valider

    const saleToValidate = allSales.find(s => s.id === saleId);
    if (!saleToValidate || saleToValidate.status !== 'pending') {
      showNotification('error', 'Impossible de valider cette vente.');
      return;
    }

    // Utiliser processSaleValidation pour validation atomique du stock
    processSaleValidation(
      saleToValidate.items,
      () => {
        // Success callback: mettre à jour le statut de la vente
        setAllSales(prev => prev.map(s =>
          s.id === saleId
            ? { ...s, status: 'validated', validatedBy: validatorId, validatedAt: new Date() }
            : s
        ));
        showNotification('success', `Vente #${saleId.slice(-4)} validée et stock mis à jour.`);
      },
      (error) => {
        // Error callback: stock insuffisant
        showNotification('error', error);
      }
    );
  }, [allSales, setAllSales, processSaleValidation, hasPermission, showNotification]);

  const rejectSale = useCallback((saleId: string, rejectorId: string) => {
    if (!hasPermission('canManageInventory')) return; // Seul un gérant peut rejeter

    const saleToReject = allSales.find(s => s.id === saleId);
    if (!saleToReject || saleToReject.status !== 'pending') {
      showNotification('error', 'Impossible de rejeter cette vente.');
      return;
    }

    // Mettre à jour le statut de la vente, SANS toucher au stock
    setAllSales(prev => prev.map(s => 
      s.id === saleId 
        ? { ...s, status: 'rejected', rejectedBy: rejectorId, rejectedAt: new Date() } 
        : s
    ));

    showNotification('info', `Vente #${saleId.slice(-4)} rejetée.`);

  }, [allSales, setAllSales, hasPermission, showNotification]);

  // ✅ Fonctions de récupération des ventes (utiliser validatedAt pour les ventes validées)
  const getSalesByDate = useCallback((startDate: Date, endDate: Date) => {
    const filteredSales = sales.filter(sale => {
      // ✅ Utiliser validatedAt pour les ventes validées
      const saleDate = sale.validatedAt ? new Date(sale.validatedAt) : new Date(sale.createdAt);
      return sale.status === 'validated' && saleDate >= startDate && saleDate <= endDate;
    });
    if (currentSession?.role === 'serveur') {
      return filteredSales.filter(sale => sale.createdBy === currentSession.userId);
    }
    return filteredSales;
  }, [sales, currentSession]);

  const getTodaySales = useCallback(() => {
    const closeHour = currentBar?.settings?.businessDayCloseHour ?? 6;
    const currentBusinessDay = getCurrentBusinessDay(closeHour);

    const todaySales = sales.filter(sale => {
      if (sale.status !== 'validated') return false;
      // ✅ Utiliser validatedAt pour les ventes validées, pas createdAt
      const saleDate = sale.validatedAt ? new Date(sale.validatedAt) : new Date(sale.createdAt);
      const saleBusinessDay = getBusinessDay(saleDate, closeHour);
      return isSameDay(saleBusinessDay, currentBusinessDay);
    });

    // 🔒 SERVEURS : Voir uniquement LEURS ventes
    if (currentSession?.role === 'serveur') {
      return todaySales.filter(sale => sale.createdBy === currentSession.userId);
    }

    // ✅ GÉRANTS/PROMOTEURS : Voir TOUTES les ventes
    return todaySales;
  }, [sales, currentBar, currentSession]);

  const getTodayTotal = useCallback(() => {
    const todaySales = getTodaySales();
    const salesTotal = todaySales.reduce((sum, sale) => sum + sale.total, 0);

    // Déduire les retours remboursés du jour (CA NET = Ventes - Retours)
    const closeHour = currentBar?.settings?.businessDayCloseHour ?? 6;
    const currentBusinessDay = getCurrentBusinessDay(closeHour);

    // 🔒 SERVEURS : Ne déduire que les retours de LEURS ventes
    const todaySaleIds = new Set(todaySales.map(s => s.id));

    const returnsTotal = returns
      .filter(r => {
        // Seulement retours approuvés/restockés (pas pending ni rejected)
        if (r.status !== 'approved' && r.status !== 'restocked') return false;
        // Seulement retours remboursés
        if (!r.isRefunded) return false;
        // 🔒 IMPORTANT: Seulement retours des ventes affichées (filtrage par serveur)
        if (!todaySaleIds.has(r.saleId)) return false;
        // Même jour commercial que les ventes
        const returnDate = new Date(r.returnedAt);
        const returnBusinessDay = getBusinessDay(returnDate, closeHour);
        return isSameDay(returnBusinessDay, currentBusinessDay);
      })
      .reduce((sum, r) => sum + r.refundAmount, 0);

    return salesTotal - returnsTotal; // CA NET
  }, [getTodaySales, returns, currentBar]);

  const getSalesByUser = useCallback((userId: string) => {
    if (!hasPermission('canViewAllSales')) return [];
    return sales.filter(sale => sale.status === 'validated' && sale.createdBy === userId);
  }, [sales, hasPermission]);

  // ===== NOUVEAU : CA NET SERVEUR (avec déduction retours) =====
  const getServerRevenue = useCallback((
    userId: string,
    startDate?: Date,
    endDate?: Date
  ): number => {
    // 1. Récupérer les ventes du serveur (validées uniquement)
    const serverSales = sales.filter(sale => {
      if (sale.status !== 'validated' || sale.createdBy !== userId) return false;
      if (startDate && new Date(sale.createdAt) < startDate) return false;
      if (endDate && new Date(sale.createdAt) > endDate) return false;
      return true;
    });

    const salesTotal = serverSales.reduce((sum, s) => sum + s.total, 0);

    // 2. Récupérer les retours des ventes de ce serveur (remboursés uniquement)
    const serverSaleIds = serverSales.map(s => s.id);
    const serverReturns = returns.filter(r => {
      if (!serverSaleIds.includes(r.saleId)) return false;  // Pas une vente de ce serveur
      if (r.status === 'rejected') return false;            // Retour rejeté
      if (!r.isRefunded) return false;                      // Pas remboursé
      if (startDate && new Date(r.returnedAt) < startDate) return false;
      if (endDate && new Date(r.returnedAt) > endDate) return false;
      return true;
    });

    const returnsTotal = serverReturns.reduce((sum, r) => sum + r.refundAmount, 0);

    // 3. CA NET = Ventes - Retours remboursés
    return salesTotal - returnsTotal;
  }, [sales, returns]);

  // ===== NOUVEAU : Retours liés aux ventes d'un serveur =====
  const getServerReturns = useCallback((userId: string): Return[] => {
    // Trouver toutes les ventes du serveur
    const serverSaleIds = sales
      .filter(s => s.createdBy === userId && s.status === 'validated')
      .map(s => s.id);

    // Retourner les retours liés à ces ventes
    return returns.filter(r => serverSaleIds.includes(r.saleId));
  }, [sales, returns]);

  // ... (fonctions de retour et de paramètres restent les mêmes)
  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    if (!hasPermission('canManageSettings')) return;
    setSettings(prev => ({ ...prev, ...updates }));
  }, [setSettings, hasPermission]);

  const addReturn = useCallback((returnData: Omit<Return, 'id' | 'barId'>) => {
    if (!hasPermission('canManageInventory') || !currentBar || !currentSession) return null;
    const uniqueId = `return_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newReturn: Return = { ...returnData, id: uniqueId, barId: currentBar.id };

    // 1. Optimistic update
    setAllReturns(prev => [newReturn, ...prev]);

    // 2. Enqueue pour sync
    syncQueue.enqueue('CREATE_RETURN', newReturn, currentBar.id, currentSession.userId);

    return newReturn;
  }, [setAllReturns, hasPermission, currentBar, currentSession]);

  const updateReturn = useCallback((returnId: string, updates: Partial<Return>) => {
    if (!hasPermission('canManageInventory') || !currentBar || !currentSession) return;

    // 1. Optimistic update
    setAllReturns(prev => prev.map(r => r.id === returnId ? { ...r, ...updates } : r));

    // 2. Enqueue pour sync (mise à jour statut: approved/rejected/restocked)
    syncQueue.enqueue('UPDATE_RETURN', { returnId, updates }, currentBar.id, currentSession.userId);
  }, [setAllReturns, hasPermission, currentBar, currentSession]);

  const deleteReturn = useCallback((returnId: string) => {
    if (!hasPermission('canManageInventory')) return;
    setAllReturns(prev => prev.filter(r => r.id !== returnId));
  }, [setAllReturns, hasPermission]);

  const getReturnsBySale = useCallback((saleId: string) => returns.filter(r => r.saleId === saleId), [returns]);
  const getPendingReturns = useCallback(() => returns.filter(r => r.status === 'pending'), [returns]);

  // ===== DÉPENSES =====

  const addExpense = useCallback((expenseData: Omit<Expense, 'id' | 'barId' | 'createdAt'>) => {
    if (!hasPermission('canManageInventory') || !currentBar || !currentSession) return null;

    const newExpense: Expense = {
      ...expenseData,
      id: `exp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      barId: currentBar.id,
      createdAt: new Date(),
    };

    // 1. Optimistic update
    setAllExpenses(prev => [...prev, newExpense]);

    // 2. Enqueue pour sync
    syncQueue.enqueue('ADD_EXPENSE', newExpense, currentBar.id, currentSession.userId);

    return newExpense;
  }, [currentBar, currentSession, setAllExpenses, hasPermission]);

  const deleteExpense = useCallback((expenseId: string) => {
    if (!hasPermission('canManageInventory')) return;
    setAllExpenses(prev => prev.filter(exp => exp.id !== expenseId));
  }, [setAllExpenses, hasPermission]);

  const addCustomExpenseCategory = useCallback((name: string, icon: string, createdBy: string) => {
    if (!hasPermission('canManageInventory') || !currentBar) return null;

    const newCategory: ExpenseCategoryCustom = {
      id: `cat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      barId: currentBar.id,
      name,
      icon,
      createdAt: new Date(),
      createdBy,
    };

    setAllCustomExpenseCategories(prev => [...prev, newCategory]);
    return newCategory;
  }, [currentBar, setAllCustomExpenseCategories, hasPermission]);

  const value: AppContextType = {
    // État
    categories, products, supplies, sales, returns, settings, users,
    expenses, customExpenseCategories,

    // Catégories
    addCategory, addCategories, updateCategory, deleteCategory,

    // Produits (lecture seule - mutations via StockContext)
    getProductsByCategory, getLowStockProducts, getProductById,

    // Approvisionnements (read-only - use StockContext for mutations)
    getSuppliesByProduct, getTotalCostByProduct, getAverageCostPerUnit,

    // Ventes
    addSale, validateSale, rejectSale, // NOUVELLES FONCTIONS
    getSalesByDate, getTodaySales, getTodayTotal, getSalesByUser,
    getServerRevenue, getServerReturns, // ✅ NOUVEAU : CA net serveur

    // Retours
    addReturn, updateReturn, deleteReturn, getReturnsBySale, getPendingReturns,

    // Dépenses
    addExpense, deleteExpense, addCustomExpenseCategory,

    // Paramètres
    updateSettings,

    // Initialisation
    initializeBarData,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};