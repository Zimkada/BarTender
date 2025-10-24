/**
 * Utilitaires de calcul business purs (sans dépendances React)
 * Ces fonctions resteront valables même après migration backend
 */

import type { Sale, Return, Product, SaleItem } from '../types';

/**
 * Calcule le montant total d'une vente
 */
export function calculateSaleTotal(items: SaleItem[]): number {
  return items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
}

/**
 * Calcule le coût total d'une vente (prix d'achat)
 */
export function calculateSaleCost(items: SaleItem[], products: Product[]): number {
  return items.reduce((sum, item) => {
    const product = products.find(p => p.id === item.productId);
    const costPrice = product?.costPrice ?? 0;
    return sum + (costPrice * item.quantity);
  }, 0);
}

/**
 * Calcule le bénéfice d'une vente (Total - Coût)
 */
export function calculateSaleProfit(items: SaleItem[], products: Product[]): number {
  const total = calculateSaleTotal(items);
  const cost = calculateSaleCost(items, products);
  return total - cost;
}

/**
 * Calcule la marge bénéficiaire en pourcentage
 */
export function calculateProfitMargin(profit: number, total: number): number {
  if (total === 0) return 0;
  return (profit / total) * 100;
}

/**
 * Calcule le CA total des ventes (somme des totaux)
 */
export function calculateRevenue(sales: Sale[]): number {
  return sales.reduce((sum, sale) => sum + sale.total, 0);
}

/**
 * Calcule le montant total des retours remboursés
 */
export function calculateRefundedReturns(returns: Return[]): number {
  return returns
    .filter(r => r.status !== 'rejected' && r.isRefunded)
    .reduce((sum, r) => sum + r.refundAmount, 0);
}

/**
 * Calcule le CA net (Ventes - Retours remboursés)
 */
export function calculateNetRevenue(sales: Sale[], returns: Return[]): number {
  const revenue = calculateRevenue(sales);
  const refunded = calculateRefundedReturns(returns);
  return revenue - refunded;
}

/**
 * Calcule le coût total des approvisionnements
 */
export function calculateSupplyCost(lotPrice: number, lotSize: number): number {
  return lotPrice * lotSize;
}

/**
 * Calcule le prix unitaire d'un produit approvisionné
 */
export function calculateUnitCost(lotPrice: number, lotSize: number): number {
  if (lotSize === 0) return 0;
  return lotPrice / lotSize;
}

/**
 * Calcule le stock disponible (physique - consigné)
 */
export function calculateAvailableStock(physicalStock: number, consignedStock: number): number {
  return Math.max(0, physicalStock - consignedStock);
}

/**
 * Vérifie si un stock est en alerte basse
 */
export function isLowStock(currentStock: number, minStock: number): boolean {
  return currentStock <= minStock;
}

/**
 * Calcule le taux de marge (markup) sur un produit
 */
export function calculateMarkup(sellingPrice: number, costPrice: number): number {
  if (costPrice === 0) return 0;
  return ((sellingPrice - costPrice) / costPrice) * 100;
}

/**
 * Calcule le prix de vente suggéré selon un taux de marge cible
 */
export function calculateSellingPrice(costPrice: number, targetMarkupPercent: number): number {
  return costPrice * (1 + targetMarkupPercent / 100);
}

/**
 * Calcule la valeur totale du stock (quantité × prix d'achat)
 */
export function calculateStockValue(products: Product[]): number {
  return products.reduce((sum, p) => sum + (p.stock * (p.costPrice ?? 0)), 0);
}

/**
 * Calcule le nombre d'articles vendus dans une période
 */
export function calculateTotalItemsSold(sales: Sale[]): number {
  return sales.reduce((sum, sale) => {
    return sum + sale.items.reduce((itemSum, item) => itemSum + item.quantity, 0);
  }, 0);
}
