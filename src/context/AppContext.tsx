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
import type { KitchenCartItem } from '../hooks/useKitchenCart';
import type { DishRow, DishPriceOptionRow } from '../services/supabase/dishes.service';

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

  /**
   * ⭐ PANIER CUISINE — état SÉPARÉ du panier boissons (module restauration).
   *
   * ⚠️ Deux listes, mais UNE SEULE addition : à la validation, les deux
   * partent sur le MÊME `ticket_id` (§16.7 — « sinon l'addition serait
   * fragmentée »). La séparation est de SAISIE, pas de facturation.
   *
   * ⚠️ Un plat n'entre PAS dans `cart` : `CartItem.product` est typé `Product`
   * et consommé par 11 fichiers du flux de vente commun à tous les bars. Sur
   * un bar pur, `kitchenItems` reste vide et rien ne s'affiche — l'invariance
   * du §3 est structurelle, pas conditionnelle.
   */
  kitchenItems: KitchenCartItem[];
  /** ⭐ §19.5 — `priceOption` absent pour un plat à prix ferme. */
  addDish: (dish: DishRow, priceOption?: DishPriceOptionRow) => void;
  /**
   * ⚠️ §19.5 — ces trois fonctions prennent la CLÉ DE LIGNE, pas un `dishId` :
   * un même plat peut occuper plusieurs lignes (un Grand et un Petit), et agir
   * par `dishId` toucherait les deux. Utiliser `kitchenLineKey` pour la
   * construire — jamais la concaténer à la main.
   */
  updateKitchenQuantity: (lineKey: string, quantity: number) => void;
  removeDish: (lineKey: string) => void;
  setDishModifiers: (lineKey: string, modifiers: string[]) => void;
  clearKitchenCart: () => void;
  /** ⭐ §19.5 — construit la clé d'une ligne du panier cuisine. */
  kitchenLineKey: (dishId: string, priceOptionId?: string) => string;
  /** Quantités par `dish_id` — alimente les pastilles de `DishGrid`. */
  kitchenQuantities: Record<string, number>;
  /** ⚠️ INDICATIF : ces plats ne sont pas encore vendus (§6). */
  kitchenTotal: number;
  kitchenItemCount: number;

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
  provideExchange: (returnData: Pick<Return, 'saleId' | 'productId' | 'productName' | 'productVolume' | 'quantitySold' | 'quantityReturned' | 'reason' | 'returnedAt' | 'refundAmount' | 'isRefunded' | 'autoRestock' | 'manualRestockRequired'> & Partial<Return>, swapProduct: Product, ticketId?: string) => Promise<void>;

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