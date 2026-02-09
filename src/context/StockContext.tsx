// StockContext.tsx - Context pour centraliser la gestion du stock
// Wrapper autour de useUnifiedStock pour le rendre accessible globalement
import React, { createContext, ReactNode } from 'react';
import { useUnifiedStock, CreateConsignmentData } from '../hooks/pivots/useUnifiedStock';
import { useBarContext } from './BarContext';
import type { Product, Supply, Consignment, ProductStockInfo, Expense } from '../types';

interface StockContextType {
  // Products
  products: Product[];
  addProduct: (product: Omit<Product, 'id' | 'createdAt'>) => void;
  addProducts: (products: Omit<Product, 'id' | 'createdAt'>[]) => void; // Batch import
  updateProduct: (id: string, updates: Partial<Product>) => void;
  deleteProduct: (id: string) => void;

  // Supplies
  supplies: Supply[];
  processSupply: (
    supplyData: { productId: string; quantity: number; lotSize: number; lotPrice: number; supplier: string },
    onExpenseCreated: (expenseData: Omit<Expense, 'id' | 'barId' | 'createdAt'>) => void
  ) => void;
  getAverageCostPerUnit: (productId: string) => number;

  // Stock Info
  getProductStockInfo: (productId: string) => ProductStockInfo | null;

  // Consignments
  consignments: Consignment[];
  createConsignment: (data: CreateConsignmentData) => Promise<unknown>;
  claimConsignment: (consignmentId: string) => boolean;
  forfeitConsignment: (consignmentId: string) => boolean;
  getActiveConsignments: () => Consignment[];
}

// Export du context pour le hook séparé (compatibilité Vite Fast Refresh)
export const StockContext = createContext<StockContextType | undefined>(undefined);

interface StockProviderProps {
  children: ReactNode;
}

export function StockProvider({ children }: { children: React.ReactNode }) {
  const { currentBar } = useBarContext();
  const stockManager = useUnifiedStock(currentBar?.id);

  const value: StockContextType = {
    // Expose toutes les méthodes de useUnifiedStock
    products: stockManager.products,
    addProduct: stockManager.addProduct,
    addProducts: stockManager.addProducts,
    updateProduct: stockManager.updateProduct,
    deleteProduct: stockManager.deleteProduct,

    supplies: stockManager.supplies,
    processSupply: stockManager.processSupply,
    getAverageCostPerUnit: stockManager.getAverageCostPerUnit,

    getProductStockInfo: stockManager.getProductStockInfo,

    consignments: stockManager.consignments,
    createConsignment: stockManager.createConsignment,
    claimConsignment: stockManager.claimConsignment,
    forfeitConsignment: stockManager.forfeitConsignment,
    getActiveConsignments: () => stockManager.consignments.filter(c => c.status === 'active'),
  };

  return <StockContext.Provider value={value}>{children}</StockContext.Provider>;
};
