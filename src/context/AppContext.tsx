import React, { createContext, useContext, useCallback, useEffect } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { useStockBridge } from '../context/StockBridgeProvider';
import { useStock } from '../context/StockContext';
import { offlineQueue } from '../services/offlineQueue';
import { useNotifications } from '../components/Notifications';
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

// Données par défaut pour un nouveau bar
const getDefaultCategories = (barId: string): Category[] => [
  { id: `${barId}_cat_1`, barId, name: 'Bières', color: '#f59e0b', createdAt: new Date() },
  { id: `${barId}_cat_2`, barId, name: 'Sucreries', color: '#ef4444', createdAt: new Date() },
  { id: `${barId}_cat_3`, barId, name: 'Liqueurs', color: '#8b5cf6', createdAt: new Date() },
  { id: `${barId}_cat_4`, barId, name: 'Vins', color: '#dc2626', createdAt: new Date() },
];

const getDefaultProducts = (barId: string): Product[] => [
  { id: `${barId}_prod_1`, barId, name: 'Beaufort', volume: '33cl', price: 500, stock: 24, categoryId: `${barId}_cat_1`, alertThreshold: 10, createdAt: new Date() },
  { id: `${barId}_prod_2`, barId, name: 'Beaufort', volume: '50cl', price: 650, stock: 12, categoryId: `${barId}_cat_1`, alertThreshold: 8, createdAt: new Date() },
  { id: `${barId}_prod_3`, barId, name: 'Coca Cola', volume: '33cl', price: 300, stock: 48, categoryId: `${barId}_cat_2`, alertThreshold: 15, createdAt: new Date() },
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
  const [allCategories, setAllCategories] = useLocalStorage<Category[]>('categories-v3', []);
  const [allSales, setAllSales] = useLocalStorage<Sale[]>('sales-v3', []);
  const [allReturns, setAllReturns] = useLocalStorage<Return[]>('returns-v1', []);
  const [allExpenses, setAllExpenses] = useLocalStorage<Expense[]>('expenses-v1', []);
  const [allCustomExpenseCategories, setAllCustomExpenseCategories] = useLocalStorage<ExpenseCategoryCustom[]>('expense-categories-v1', []);
  const [settings, setSettings] = useLocalStorage<AppSettings>('app-settings-v3', defaultSettings);
  const [users, setUsers] = useLocalStorage<User[]>('users', []); // Assurez-vous que la clé est correcte

  // Filtrage automatique par bar actuel
  const categories = allCategories.filter(c => c.barId === currentBar?.id);
  const products = allProducts.filter(p => p.barId === currentBar?.id);
  const supplies = allSupplies.filter(s => s.barId === currentBar?.id);
  const sales = allSales.filter(s => s.barId === currentBar?.id);
  const returns = allReturns.filter(r => r.barId === currentBar?.id);
  const expenses = allExpenses.filter(e => e.barId === currentBar?.id);
  const customExpenseCategories = allCustomExpenseCategories.filter(c => c.barId === currentBar?.id);

  const { addProduct: addProductToStock } = useStock();

  const initializeBarData = useCallback((barId: string) => {
    const existingCategories = allCategories.some(c => c.barId === barId);
    if (!existingCategories) {
      const defaultCategories = getDefaultCategories(barId);
      const defaultProducts = getDefaultProducts(barId);

      // Ajouter catégories
      setAllCategories(prev => [...prev, ...defaultCategories]);

      // Ajouter produits via StockContext (source unique)
      defaultProducts.forEach(product => {
        addProductToStock(product);
      });
    }
  }, [allCategories, setAllCategories, addProductToStock]);

  // ... (fonctions categories, products, supplies restent les mêmes)
  const addCategory = useCallback((category: Omit<Category, 'id' | 'createdAt' | 'barId'>) => {
    if (!hasPermission('canAddProducts') || !currentBar) return null;
    const uniqueId = `cat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newCategory: Category = { ...category, id: uniqueId, barId: currentBar.id, createdAt: new Date() };
    setAllCategories(prev => [...prev, newCategory]);
    return newCategory;
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

    setAllSales(prev => [newSale, ...prev]);
    
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
    const salesTotal = getTodaySales().reduce((sum, sale) => sum + sale.total, 0);

    // Déduire les retours remboursés du jour (CA NET = Ventes - Retours)
    const closeHour = currentBar?.settings?.businessDayCloseHour ?? 6;
    const currentBusinessDay = getCurrentBusinessDay(closeHour);

    const returnsTotal = returns
      .filter(r => {
        // Seulement retours approuvés/restockés (pas pending ni rejected)
        if (r.status !== 'approved' && r.status !== 'restocked') return false;
        // Seulement retours remboursés
        if (!r.isRefunded) return false;
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

  // ... (fonctions de retour et de paramètres restent les mêmes)
  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    if (!hasPermission('canManageSettings')) return;
    setSettings(prev => ({ ...prev, ...updates }));
  }, [setSettings, hasPermission]);

  const addReturn = useCallback((returnData: Omit<Return, 'id' | 'barId'>) => {
    if (!hasPermission('canManageInventory') || !currentBar) return null;
    const uniqueId = `return_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newReturn: Return = { ...returnData, id: uniqueId, barId: currentBar.id };
    setAllReturns(prev => [newReturn, ...prev]);
    return newReturn;
  }, [setAllReturns, hasPermission, currentBar]);

  const updateReturn = useCallback((returnId: string, updates: Partial<Return>) => {
    if (!hasPermission('canManageInventory')) return;
    setAllReturns(prev => prev.map(r => r.id === returnId ? { ...r, ...updates } : r));
  }, [setAllReturns, hasPermission]);

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

    setAllExpenses(prev => [...prev, newExpense]);
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
    addCategory, updateCategory, deleteCategory,

    // Produits (lecture seule - mutations via StockContext)
    getProductsByCategory, getLowStockProducts, getProductById,

    // Approvisionnements (read-only - use StockContext for mutations)
    getSuppliesByProduct, getTotalCostByProduct, getAverageCostPerUnit,

    // Ventes
    addSale, validateSale, rejectSale, // NOUVELLES FONCTIONS
    getSalesByDate, getTodaySales, getTodayTotal, getSalesByUser,

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