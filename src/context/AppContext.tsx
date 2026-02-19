import { createContext, useContext } from 'react';
import {
  Category,
  Product,
  Sale,
  AppSettings,
  Return,
  User,
  Expense,
  ExpenseCategoryCustom,
  CartItem,
} from '../types';

export interface AppContextType {
  // L'ÉTAT DES DONNÉES EST MAINTENANT GÉRÉ PAR LES SMART HOOKS (useUnifiedSales, etc.)
  // Le contexte ne fournit plus que les paramètres globaux et les membres du bar.
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


  // Ventes
  addSale: (saleData: Partial<Sale>) => Promise<Sale | null>;
  validateSale: (saleId: string, validatorId: string) => void;
  rejectSale: (saleId: string, rejectorId: string) => void;

  // Retours (État géré par useUnifiedReturns)
  addReturn: (returnData: Omit<Return, 'id' | 'barId'>) => void;
  updateReturn: (returnId: string, updates: Partial<Return>) => void;
  deleteReturn: (returnId: string) => void;
  provideExchange: (returnData: any, swapProduct: Product, ticketId?: string) => Promise<void>;

  // Dépenses (État géré par useUnifiedExpenses)
  customExpenseCategories: ExpenseCategoryCustom[];
  addExpense: (expenseData: Omit<Expense, 'id' | 'barId' | 'createdAt'>) => void;
  deleteExpense: (expenseId: string) => void;
  addCustomExpenseCategory: (name: string, icon: string, createdBy: string) => void;

  updateSettings: (updates: Partial<AppSettings>) => void;
}

export const AppContext = createContext<AppContextType | undefined>(undefined);

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};