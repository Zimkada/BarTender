// StockContext.tsx - Context pour centraliser la gestion du stock
// Wrapper autour de useStockManagement pour le rendre accessible globalement
import React, { createContext, useContext, ReactNode } from 'react';
import { useStockManagement } from '../hooks/useStockManagement';
import type { Product, Supply, Consignment, ProductStockInfo } from '../types';

interface StockContextType {
  // Products
  products: Product[];
  addProduct: (product: Omit<Product, 'id' | 'createdAt'>) => Product;
  addProducts: (products: Omit<Product, 'id' | 'createdAt'>[]) => Product[]; // Batch import
  updateProduct: (id: string, updates: Partial<Product>) => void;
  deleteProduct: (id: string) => void;

  // Supplies
  supplies: Supply[];
  processSupply: (
    supplyData: { productId: string; quantity: number; lotSize: number; lotPrice: number; supplier: string },
    onExpenseCreated: (expenseData: any) => void
  ) => void;
  getAverageCostPerUnit: (productId: string) => number;

  // Stock Info
  getProductStockInfo: (productId: string) => ProductStockInfo | null;

  // Consignments
  consignments: Consignment[];
  createConsignment: (data: Omit<Consignment, 'id' | 'barId' | 'createdAt' | 'createdBy' | 'status'> & { expirationDays?: number }) => Consignment | null;
  claimConsignment: (consignmentId: string) => boolean;
  forfeitConsignment: (consignmentId: string) => boolean;
  getActiveConsignments: () => Consignment[];
}

const StockContext = createContext<StockContextType | undefined>(undefined);

export const useStock = () => {
  const context = useContext(StockContext);
  if (!context) {
    throw new Error('useStock must be used within StockProvider');
  }
  return context;
};

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
