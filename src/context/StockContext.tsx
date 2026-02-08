// StockContext.tsx - Context pour centraliser la gestion du stock
// Wrapper autour de useStockManagement pour le rendre accessible globalement
import React, { createContext, ReactNode } from 'react';
import { useStockManagement, type CreateConsignmentData } from '../hooks/useStockManagement';
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

export const StockProvider: React.FC<StockProviderProps> = ({ children }) => {
  const stockManagement = useStockManagement();

  const value: StockContextType = {
    // Expose toutes les méthodes de useStockManagement
    products: stockManagement.products,
    addProduct: stockManagement.addProduct,
    addProducts: stockManagement.addProducts, // Batch import
    updateProduct: stockManagement.updateProduct,
    deleteProduct: stockManagement.deleteProduct,

    supplies: stockManagement.supplies,
    processSupply: stockManagement.processSupply,
    getAverageCostPerUnit: stockManagement.getAverageCostPerUnit,

    getProductStockInfo: stockManagement.getProductStockInfo,

    consignments: stockManagement.consignments,
    createConsignment: stockManagement.createConsignment,
    claimConsignment: stockManagement.claimConsignment,
    forfeitConsignment: stockManagement.forfeitConsignment,
    getActiveConsignments: stockManagement.getActiveConsignments,
  };

  return <StockContext.Provider value={value}>{children}</StockContext.Provider>;
};
