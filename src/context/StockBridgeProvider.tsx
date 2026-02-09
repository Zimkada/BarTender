/**
 * StockBridgeProvider - Bridge Pattern pour injection de dépendance
 *
 * Permet à AppContext d'accéder aux fonctions de useUnifiedStock
 * sans créer de dépendance circulaire.
 *
 * Architecture:
 * App → StockBridgeProvider → AppContextProvider → Components
 *            ↓
 *      useUnifiedStock (source de vérité)
 */

import { createContext } from 'react';
import { useUnifiedStock } from '../hooks/pivots/useUnifiedStock';
import { useBarContext } from '../context/BarContext';

// Type du contexte = Retour de useUnifiedStock
type StockBridgeContextType = ReturnType<typeof useUnifiedStock> | null;

// Export du context pour le hook séparé (compatibilité Vite Fast Refresh)
export const StockBridgeContext = createContext<StockBridgeContextType>(null);

/**
 * Provider qui expose useUnifiedStock à toute l'app via Context
 */
export const StockBridgeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentBar } = useBarContext();
  const stockManager = useUnifiedStock(currentBar?.id);

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
