/**
 * Hook pour consommer le StockBridgeContext
 *
 * ✅ Séparé du Provider pour compatibilité Vite Fast Refresh
 *
 * Bridge Pattern pour injection de dépendance
 * Permet à AppContext d'accéder aux fonctions de useStockManagement
 * sans créer de dépendance circulaire.
 *
 * @throws Error si utilisé hors du StockBridgeProvider
 * @example
 * const { processSaleValidation, processSupply } = useStockBridge();
 */

import { useContext } from 'react';
import { StockBridgeContext } from '../StockBridgeProvider';

export const useStockBridge = () => {
  const context = useContext(StockBridgeContext);

  if (!context) {
    throw new Error('useStockBridge must be used within StockBridgeProvider');
  }

  return context;
};
