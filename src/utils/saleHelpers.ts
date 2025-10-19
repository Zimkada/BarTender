// utils/saleHelpers.ts
import type { Sale } from '../types';

/**
 * Obtient la date "effective" d'une vente selon son statut
 *
 * Pour une vente VALIDÉE : utilise validatedAt (date de validation = date de sortie stock)
 * Pour une vente PENDING/REJECTED : utilise createdAt (date de création)
 *
 * @param sale - La vente
 * @returns Date effective de la vente
 */
export function getSaleDate(sale: Sale): Date {
  // Pour les ventes validées, la date effective est la validation (= date CA + sortie stock)
  if (sale.status === 'validated' && sale.validatedAt) {
    return new Date(sale.validatedAt);
  }

  // Pour les ventes rejetées, utiliser la date de rejet
  if (sale.status === 'rejected' && sale.rejectedAt) {
    return new Date(sale.rejectedAt);
  }

  // Par défaut (pending ou absence de date validation), utiliser date création
  return new Date(sale.createdAt);
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
