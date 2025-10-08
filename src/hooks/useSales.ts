import { useLocalStorage } from './useLocalStorage';
import { Sale } from '../types';

/**
 * Hook pour gérer les ventes d'un bar spécifique.
 * @param barId L'identifiant du bar pour lequel récupérer les ventes.
 */
export function useSales(barId: string) {
  // Les données de ventes sont stockées dans une clé partagée `sales-v3` 
  // et contiennent un `barId`. Nous devons donc charger toutes les ventes
  // puis les filtrer.
  const [allSales] = useLocalStorage<Sale[]>('sales-v3', []);

  const sales = allSales.filter(sale => sale.barId === barId);

  return { sales };
}