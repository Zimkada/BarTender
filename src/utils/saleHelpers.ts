// utils/saleHelpers.ts
import type { Sale } from '../types';

/**
 * Obtient la date commerciale d'une vente
 * 
 * ✅ SIMPLIFIÉ : Utilise uniquement businessDate (toujours remplie après migration 067)
 * - Mode online : Calculée par le trigger SQL
 * - Mode offline : Calculée par le frontend avant insertion
 * 
 * @param sale - La vente
 * @returns Date commerciale de la vente
 */
export function getSaleDate(sale: Sale): Date {
  return typeof sale.businessDate === 'string'
    ? new Date(sale.businessDate)
    : sale.businessDate;
}

/**
 * Formate la date d'une vente au format local français
 *
 * @param sale - La vente
 * @param includeTime - Inclure l'heure (défaut: false)
 * @returns Date formatée (ex: "18/10/2025" ou "18/10/2025 à 14:30")
 */
export function formatSaleDate(sale: Sale, includeTime = false): string {
  const date = getSaleDate(sale);

  if (includeTime) {
    return date.toLocaleString('fr-FR');
  }

  return date.toLocaleDateString('fr-FR');
}

/**
 * Formate l'heure d'une vente au format local français
 *
 * @param sale - La vente
 * @param shortFormat - Format court HH:mm (défaut: true)
 * @returns Heure formatée (ex: "14:30" ou "14:30:45")
 */
export function formatSaleTime(sale: Sale, shortFormat = true): string {
  const date = getSaleDate(sale);

  return date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    ...(shortFormat ? {} : { second: '2-digit' })
  });
}
