import React, { createContext, useContext, useCallback } from 'react';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { useStockBridge } from '../context/StockBridgeProvider';
import { useStock } from '../context/StockContext';
import { useNotifications } from '../components/Notifications';
import { NOTIFICATION_DURATION } from '../config/notifications';
import { auditLogger } from '../services/AuditLogger';
import {
  Category,
  Product,
  Supply,
  Sale,
  AppSettings,
  Return,
  User,
  Expense,
  ExpenseCategoryCustom,
} from '../types';
import { getBusinessDay, getCurrentBusinessDay, isSameDay } from '../utils/businessDay';

// React Query Hooks
import { useCategories } from '../hooks/queries/useStockQueries';
import { useSales } from '../hooks/queries/useSalesQueries';
import { useExpenses, useCustomExpenseCategories } from '../hooks/queries/useExpensesQueries';
import { useReturns } from '../hooks/queries/useReturnsQueries';

import { useSalesMutations } from '../hooks/mutations/useSalesMutations';
import { useExpensesMutations } from '../hooks/mutations/useExpensesMutations';
import { useReturnsMutations } from '../hooks/mutations/useReturnsMutations';
import { useCategoryMutations } from '../hooks/mutations/useCategoryMutations';

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
  users: User[];

  // Catégories
  addCategory: (category: Omit<Category, 'id' | 'createdAt' | 'barId'>) => void;
  linkCategory: (globalCategoryId: string) => void;
  addCategories: (categories: Omit<Category, 'id' | 'createdAt' | 'barId'>[]) => void;
  updateCategory: (id: string, updates: Partial<Category>) => void;
  deleteCategory: (id: string) => void;

  // Produits (lecture seule - mutations via StockContext)
  getProductsByCategory: (categoryId: string) => Product[];
  getLowStockProducts: () => Product[];
  getProductById: (id: string) => Product | undefined;

  // Approvisionnements
  getSuppliesByProduct: (productId: string) => Supply[];
  getTotalCostByProduct: (productId: string) => number;
  getAverageCostPerUnit: (productId: string) => number;

  // Ventes
  addSale: (saleData: Partial<Sale>) => void;
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
  addReturn: (returnData: Omit<Return, 'id' | 'barId'>) => void;
  updateReturn: (returnId: string, updates: Partial<Return>) => void;
  deleteReturn: (returnId: string) => void;
  getReturnsBySale: (saleId: string) => Return[];
  getPendingReturns: () => Return[];

  // Dépenses
  expenses: Expense[];
  customExpenseCategories: ExpenseCategoryCustom[];
  addExpense: (expenseData: Omit<Expense, 'id' | 'barId' | 'createdAt'>) => void;
  deleteExpense: (expenseId: string) => void;
  addCustomExpenseCategory: (name: string, icon: string, createdBy: string) => void;

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
  const { processSaleValidation } = useStockBridge();

  const barId = currentBar?.id || '';

  // React Query: Fetch data
  const { data: categories = [] } = useCategories(barId);
  const { products: allProducts, supplies: allSupplies } = useStock(); // From StockContext
  const { data: sales = [] } = useSales(barId);
  const { data: returns = [] } = useReturns(barId);
  const { data: expenses = [] } = useExpenses(barId);
  const { data: customExpenseCategories = [] } = useCustomExpenseCategories(barId);

  // React Query: Mutations
  const salesMutations = useSalesMutations(barId);
  const expensesMutations = useExpensesMutations(barId);
  const returnsMutations = useReturnsMutations(barId);
  const categoryMutations = useCategoryMutations(barId);

  // Notifications
  const { showNotification } = useNotifications();
  const settings = defaultSettings;
  const users: User[] = []; // Should come from Auth/BarContext

  // Filtrage automatique (déjà fait par les hooks qui prennent barId)
  const products = allProducts; // Déjà filtré par StockContext/useStockQueries
  const supplies = allSupplies;

  const initializeBarData = useCallback((barId: string) => {
    // Plus nécessaire avec React Query qui fetch automatiquement
    console.log('initializeBarData called - handled by React Query');
  }, []);

  // --- CATEGORIES ---
  const addCategory = useCallback((category: Omit<Category, 'id' | 'createdAt' | 'barId'>) => {
    categoryMutations.createCategory.mutate({
      name: category.name,
      color: category.color,
    }, {
      onSuccess: () => {
        showNotification('success', `Catégorie "${category.name}" créée avec succès`, { duration: 3000 });
      },
      onError: (error: any) => {
        showNotification('error', error.message || 'Erreur lors de la création de la catégorie', { duration: 5000 });
      },
    });
  }, [categoryMutations, showNotification]);

  const linkCategory = useCallback((globalCategoryId: string) => {
    categoryMutations.linkGlobalCategory.mutate(globalCategoryId, {
      onSuccess: () => {
        showNotification('success', 'Catégorie globale ajoutée avec succès', { duration: 3000 });
      },
      onError: (error: any) => {
        showNotification('error', error.message || 'Erreur lors de l\'ajout de la catégorie', { duration: 5000 });
      },
    });
  }, [categoryMutations, showNotification]);

  const addCategories = useCallback((categories: Omit<Category, 'id' | 'createdAt' | 'barId'>[]) => {
    // Créer les catégories une par une
    Promise.all(
      categories.map(cat =>
        categoryMutations.createCategory.mutateAsync({
          name: cat.name,
          color: cat.color,
        })
      )
    )
      .then(() => {
        showNotification('success', `${categories.length} catégories créées avec succès`, { duration: 3000 });
      })
      .catch((error: any) => {
        showNotification('error', error.message || 'Erreur lors de la création des catégories', { duration: 5000 });
      });
  }, [categoryMutations, showNotification]);

  const updateCategory = useCallback((id: string, updates: Partial<Category>) => {
    categoryMutations.updateCategory.mutate(
      {
        id,
        updates: {
          name: updates.name,
          color: updates.color,
        },
      },
      {
        onSuccess: () => {
          showNotification('success', 'Catégorie mise à jour avec succès', { duration: 3000 });
        },
        onError: (error: any) => {
          showNotification('error', error.message || 'Erreur lors de la mise à jour de la catégorie', { duration: 5000 });
        },
      }
    );
  }, [categoryMutations, showNotification]);

  const deleteCategory = useCallback((id: string) => {
    categoryMutations.deleteCategory.mutate(id, {
      onSuccess: () => {
        showNotification('success', 'Catégorie supprimée avec succès', { duration: 3000 });
      },
      onError: (error: any) => {
        showNotification('error', error.message || 'Erreur lors de la suppression de la catégorie', { duration: 5000 });
      },
    });
  }, [categoryMutations, showNotification]);


  // --- PRODUCTS (Read Only) ---
  const getProductsByCategory = useCallback((categoryId: string) => products.filter(p => p.categoryId === categoryId), [products]);
  const getLowStockProducts = useCallback(() => products.filter(p => p.stock <= p.alertThreshold), [products]);
  const getProductById = useCallback((id: string) => products.find(p => p.id === id), [products]);

  // --- SUPPLIES (Read Only) ---
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

  // --- SALES ---
  const addSale = useCallback((saleData: Partial<Sale>) => {
    if (!hasPermission('canSell') || !currentBar || !currentSession) return;

    const newSaleData = {
      bar_id: currentBar.id,
      items: saleData.items,
      payment_method: saleData.paymentMethod,
      sold_by: currentSession.userId,
      customer_name: saleData.customerName,
      customer_phone: saleData.customerPhone,
      notes: saleData.notes,
    };

    salesMutations.createSale.mutate(newSaleData as any);

    // Audit log handled in mutation onSuccess or here?
    // Mutation is better.
  }, [hasPermission, currentBar, currentSession, salesMutations]);

  const validateSale = useCallback((saleId: string, validatorId: string) => {
    if (!hasPermission('canManageInventory')) return;

    // Validation stock via processSaleValidation (StockBridge)
    // Mais processSaleValidation utilise useStockMutations.validateSale
    // Ici on veut valider la vente (statut) ET décrémenter le stock.
    // SalesService.validateSale ne fait que le statut.
    // SalesService.createSale décrémente le stock (si immédiat).
    // Le workflow actuel : Create (Pending) -> Validate (Stock update?).
    // Wait, SalesService.createSale decrements stock IMMEDIATELY in the service I wrote?
    // Let's check SalesService.createSale.
    // Yes: "3. Décrémenter le stock pour chaque produit".
    // So if status is pending, stock is ALREADY decremented?
    // If so, validateSale just updates status.
    // If rejectSale, we increment stock back.

    salesMutations.validateSale.mutate({ id: saleId, validatorId });
  }, [hasPermission, salesMutations]);

  const rejectSale = useCallback((saleId: string, rejectorId: string) => {
    if (!hasPermission('canManageInventory')) return;
    salesMutations.rejectSale.mutate({ id: saleId, rejectorId });
  }, [hasPermission, salesMutations]);

  const getSalesByDate = useCallback((startDate: Date, endDate: Date) => {
    const filteredSales = sales.filter(sale => {
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
      const saleDate = sale.validatedAt ? new Date(sale.validatedAt) : new Date(sale.createdAt);
      const saleBusinessDay = getBusinessDay(saleDate, closeHour);
      return isSameDay(saleBusinessDay, currentBusinessDay);
    });

    if (currentSession?.role === 'serveur') {
      return todaySales.filter(sale => sale.createdBy === currentSession.userId);
    }
    return todaySales;
  }, [sales, currentBar, currentSession]);

  const getTodayTotal = useCallback(() => {
    const todaySales = getTodaySales();
    const salesTotal = todaySales.reduce((sum, sale) => sum + sale.total, 0);

    const closeHour = currentBar?.settings?.businessDayCloseHour ?? 6;
    const currentBusinessDay = getCurrentBusinessDay(closeHour);
    const todaySaleIds = new Set(todaySales.map(s => s.id));

    const returnsTotal = returns
      .filter(r => {
        // TODO: Check return status if implemented
        if (!r.isRefunded) return false;
        if (!todaySaleIds.has(r.saleId)) return false;
        const returnDate = new Date(r.returnedAt);
        const returnBusinessDay = getBusinessDay(returnDate, closeHour);
        return isSameDay(returnBusinessDay, currentBusinessDay);
      })
      .reduce((sum, r) => sum + r.refundAmount, 0);

    return salesTotal - returnsTotal;
  }, [getTodaySales, returns, currentBar]);

  const getSalesByUser = useCallback((userId: string) => {
    if (!hasPermission('canViewAllSales')) return [];
    return sales.filter(sale => sale.status === 'validated' && sale.createdBy === userId);
  }, [sales, hasPermission]);

  const getServerRevenue = useCallback((userId: string, startDate?: Date, endDate?: Date): number => {
    const serverSales = sales.filter(sale => {
      if (sale.status !== 'validated' || sale.createdBy !== userId) return false;
      if (startDate && new Date(sale.createdAt) < startDate) return false;
      if (endDate && new Date(sale.createdAt) > endDate) return false;
      return true;
    });

    const salesTotal = serverSales.reduce((sum, s) => sum + s.total, 0);
    const serverSaleIds = serverSales.map(s => s.id);

    const serverReturns = returns.filter(r => {
      if (!serverSaleIds.includes(r.saleId)) return false;
      if (!r.isRefunded) return false;
      if (startDate && new Date(r.returnedAt) < startDate) return false;
      if (endDate && new Date(r.returnedAt) > endDate) return false;
      return true;
    });

    const returnsTotal = serverReturns.reduce((sum, r) => sum + r.refundAmount, 0);
    return salesTotal - returnsTotal;
  }, [sales, returns]);

  const getServerReturns = useCallback((userId: string): Return[] => {
    const serverSaleIds = sales
      .filter(s => s.createdBy === userId && s.status === 'validated')
      .map(s => s.id);
    return returns.filter(r => serverSaleIds.includes(r.saleId));
  }, [sales, returns]);


  // --- RETURNS ---
  const addReturn = useCallback((returnData: Omit<Return, 'id' | 'barId'>) => {
    if (!hasPermission('canManageInventory') || !currentBar || !currentSession) return;

    returnsMutations.createReturn.mutate({
      ...returnData,
      barId: currentBar.id,
      returnedBy: currentSession.userId
    });
  }, [hasPermission, currentBar, currentSession, returnsMutations]);

  const updateReturn = useCallback((returnId: string, updates: Partial<Return>) => {
    if (!hasPermission('canManageInventory')) return;
    returnsMutations.updateReturn.mutate({ id: returnId, updates });
  }, [hasPermission, returnsMutations]);

  const deleteReturn = useCallback((returnId: string) => {
    if (!hasPermission('canManageInventory')) return;
    returnsMutations.deleteReturn.mutate(returnId);
  }, [hasPermission, returnsMutations]);

  const getReturnsBySale = useCallback((saleId: string) => returns.filter(r => r.saleId === saleId), [returns]);
  const getPendingReturns = useCallback(() => returns.filter(r => r.status === 'pending'), [returns]);


  // --- EXPENSES ---
  const addExpense = useCallback((expenseData: Omit<Expense, 'id' | 'barId' | 'createdAt'>) => {
    if (!hasPermission('canManageInventory') || !currentBar || !currentSession) return;
    expensesMutations.createExpense.mutate({
      ...expenseData,
      barId: currentBar.id,
      createdBy: currentSession.userId
    });
  }, [hasPermission, currentBar, currentSession, expensesMutations]);

  const deleteExpense = useCallback((expenseId: string) => {
    if (!hasPermission('canManageInventory')) return;
    expensesMutations.deleteExpense.mutate(expenseId);
  }, [hasPermission, expensesMutations]);

  const addCustomExpenseCategory = useCallback((name: string, icon: string, createdBy: string) => {
    if (!hasPermission('canManageInventory') || !currentBar) return;
    expensesMutations.createCustomCategory.mutate({ name, icon });
  }, [hasPermission, currentBar, expensesMutations]);


  // --- SETTINGS ---
  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    // TODO: Implement settings mutation
    console.log('updateSettings', updates);
  }, []);

  const value: AppContextType = {
    categories, products, supplies, sales, returns, settings, users,
    expenses, customExpenseCategories,
    addCategory,
    linkCategory,
    addCategories, updateCategory, deleteCategory,
    getProductsByCategory, getLowStockProducts, getProductById,
    getSuppliesByProduct, getTotalCostByProduct, getAverageCostPerUnit,
    addSale, validateSale, rejectSale,
    getSalesByDate, getTodaySales, getTodayTotal, getSalesByUser,
    getServerRevenue, getServerReturns,
    addReturn, updateReturn, deleteReturn, getReturnsBySale, getPendingReturns,
    addExpense, deleteExpense, addCustomExpenseCategory,
    updateSettings,
    initializeBarData,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};