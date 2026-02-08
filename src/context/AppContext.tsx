import { createContext, useContext } from 'react';
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
  CartItem,
} from '../types';

export interface AppContextType {
  // État
  categories: Category[];
  products: Product[];
  supplies: Supply[];
  sales: Sale[];
  settings: AppSettings;
  users: User[];

  // PANIER (NEW)
  cart: CartItem[];
  addToCart: (product: Product) => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;

  // Catégories
  addCategory: (category: Omit<Category, 'id' | 'createdAt' | 'barId'>) => Promise<Category>;
  linkCategory: (globalCategoryId: string) => Promise<void>;
  addCategories: (categories: Omit<Category, 'id' | 'createdAt' | 'barId'>[]) => Promise<Category[]>;
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
  addSale: (saleData: Partial<Sale>) => Promise<Sale | null>;
  validateSale: (saleId: string, validatorId: string) => void;
  rejectSale: (saleId: string, rejectorId: string) => void;
  getSalesByDate: (startDate: Date, endDate: Date, includePending?: boolean) => Sale[];
  getTodaySales: (includePending?: boolean) => Sale[];
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
  getTodayReturns: () => Return[];

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

export const AppContext = createContext<AppContextType | undefined>(undefined);

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};