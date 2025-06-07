import { useLocalStorage } from './useLocalStorage';
import { Supply } from '../types';

export function useSupplies() {
  const [supplies, setSupplies] = useLocalStorage<Supply[]>('bar-supplies', []);

  const addSupply = (supply: Omit<Supply, 'id' | 'date' | 'totalCost'>) => {
    const totalCost = (supply.quantity / supply.lotSize) * supply.lotPrice;
    const newSupply: Supply = {
      ...supply,
      id: Date.now().toString(),
      date: new Date(),
      totalCost,
    };
    setSupplies([newSupply, ...supplies]);
    return newSupply;
  };

  const getSuppliesByProduct = (productId: string) => {
    return supplies.filter(supply => supply.productId === productId);
  };

  const getTotalCostByProduct = (productId: string) => {
    return supplies
      .filter(supply => supply.productId === productId)
      .reduce((total, supply) => total + supply.totalCost, 0);
  };

  const getAverageCostPerUnit = (productId: string) => {
    const productSupplies = getSuppliesByProduct(productId);
    if (productSupplies.length === 0) return 0;
    
    const totalQuantity = productSupplies.reduce((sum, supply) => sum + supply.quantity, 0);
    const totalCost = productSupplies.reduce((sum, supply) => sum + supply.totalCost, 0);
    
    return totalQuantity > 0 ? totalCost / totalQuantity : 0;
  };

  return {
    supplies,
    addSupply,
    getSuppliesByProduct,
    getTotalCostByProduct,
    getAverageCostPerUnit,
  };
}