// StockContext.tsx - Context pour centraliser la gestion du stock
// Wrapper autour de useUnifiedStock pour le rendre accessible globalement
import React, { createContext } from 'react';
import { useUnifiedStock, CreateConsignmentData } from '../hooks/pivots/useUnifiedStock';
import { useBarContext } from './BarContext';
import type { Product, Consignment, ProductStockInfo, Category } from '../types';

interface StockContextType {
  // Products
  products: Product[];
  categories: Category[];
  isLoading: boolean;
  addProduct: (product: Omit<Product, 'id' | 'createdAt'>) => Promise<unknown>;
  addProducts: (products: Omit<Product, 'id' | 'createdAt'>[]) => void; // Batch import
  updateProduct: (id: string, updates: Partial<Product>) => Promise<unknown>;
  deleteProduct: (id: string) => Promise<unknown>;

  // Stock Info
  getProductStockInfo: (productId: string) => ProductStockInfo | null;

  // Consignments
  consignments: Consignment[];
  createConsignment: (data: CreateConsignmentData) => Promise<unknown>;
  // Retour : false si pré-condition KO (consignment introuvable / session manquante),
  // sinon Promise qui résout après l'écriture DB. Le consommateur await la Promise
  // et gère success/error via try/catch (cf. ConsignmentPage).
  claimConsignment: (consignmentId: string) => false | Promise<unknown>;
  forfeitConsignment: (consignmentId: string) => false | Promise<unknown>;
  getActiveConsignments: () => Consignment[];
}

export const StockContext = createContext<StockContextType | undefined>(undefined);

export function StockProvider({ children }: { children: React.ReactNode }) {
  const { currentBar } = useBarContext();
  const stockManager = useUnifiedStock(currentBar?.id, { skipSupplies: true });

  const value: StockContextType = {
    // Expose toutes les méthodes de useUnifiedStock
    products: stockManager.products,
    categories: stockManager.categories,
    isLoading: stockManager.isLoading,
    addProduct: stockManager.addProduct,
    addProducts: stockManager.addProducts,
    updateProduct: stockManager.updateProduct,
    deleteProduct: stockManager.deleteProduct,

    getProductStockInfo: stockManager.getProductStockInfo,

    consignments: stockManager.consignments,
    createConsignment: stockManager.createConsignment,
    claimConsignment: stockManager.claimConsignment,
    forfeitConsignment: stockManager.forfeitConsignment,
    getActiveConsignments: () => stockManager.consignments.filter(c => c.status === 'active'),
  };

  return <StockContext.Provider value={value}>{children}</StockContext.Provider>;
};
