/**
 * Hook pour consommer le StockContext
 *
 * ✅ Séparé du Provider pour compatibilité Vite Fast Refresh
 *
 * @throws Error si utilisé hors du StockProvider
 * @example
 * const { products, addProduct, supplies } = useStock();
 */

import { useContext } from 'react';
import { StockContext } from '../StockContext';

export const useStock = () => {
  const context = useContext(StockContext);

  if (!context) {
    throw new Error('useStock must be used within StockProvider');
  }

  return context;
};
