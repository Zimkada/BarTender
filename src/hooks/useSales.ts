import { useLocalStorage } from './useLocalStorage';
import { Sale } from '../types';

export function useSales() {
  const [sales, setSales] = useLocalStorage<Sale[]>('bar-sales', []);

  const addSale = (sale: Omit<Sale, 'id' | 'date'>) => {
    const newSale: Sale = {
      ...sale,
      id: Date.now().toString(),
      date: new Date(),
    };
    setSales([newSale, ...sales]);
    return newSale;
  };

  const getTodaySales = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return sales.filter(sale => {
      const saleDate = new Date(sale.date);
      return saleDate >= today && saleDate < tomorrow;
    });
  };

  const getTodayTotal = () => {
    return getTodaySales().reduce((total, sale) => total + sale.total, 0);
  };

  return {
    sales,
    addSale,
    getTodaySales,
    getTodayTotal,
  };
}