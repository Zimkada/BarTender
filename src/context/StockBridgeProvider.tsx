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

import { createContext, useContext, ReactNode } from 'react';
import { useStockManagement } from '../hooks/useStockManagement';

// Type du contexte = Retour de useStockManagement
type StockBridgeContextType = ReturnType<typeof useStockManagement> | null;

const StockBridgeContext = createContext<StockBridgeContextType>(null);

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
 * Hook pour consommer le StockBridge depuis n'importe quel composant
 *
 * @throws Error si utilisé hors du StockBridgeProvider
 * @example
 * const { processSaleValidation, processSupply } = useStockBridge();
 */
export const useStockBridge = () => {
  const context = useContext(StockBridgeContext);

  if (!context) {
    throw new Error('useStockBridge must be used within StockBridgeProvider');
  }

  return context;
};
