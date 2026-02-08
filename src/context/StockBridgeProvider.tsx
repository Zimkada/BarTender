/**
 * StockBridgeProvider - Bridge Pattern pour injection de dépendance
 *
 * Permet à AppContext d'accéder aux fonctions de useStockManagement
 * sans créer de dépendance circulaire.
 *
 * Architecture:
 * App → StockBridgeProvider → AppContextProvider → Components
 *            ↓
 *      useStockManagement (source de vérité)
 */

import { createContext, ReactNode } from 'react';
import { useStockManagement } from '../hooks/useStockManagement';

// Type du contexte = Retour de useStockManagement
type StockBridgeContextType = ReturnType<typeof useStockManagement> | null;

// Export du context pour le hook séparé (compatibilité Vite Fast Refresh)
export const StockBridgeContext = createContext<StockBridgeContextType>(null);

interface StockBridgeProviderProps {
  children: ReactNode;
}

/**
 * Provider qui expose useStockManagement à toute l'app via Context
 */
export const StockBridgeProvider = ({ children }: StockBridgeProviderProps) => {
  const stockManager = useStockManagement();

  return (
    <StockBridgeContext.Provider value={stockManager}>
      {children}
    </StockBridgeContext.Provider>
  );
};

/**
 * ✅ Hook déplacé vers src/context/hooks/useStockBridge.ts
 * Pour compatibilité Vite Fast Refresh
 */
