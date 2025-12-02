/**
 * @deprecated Ce fichier est déprécié. Utilisez les fonctions de `src/utils/businessDateHelpers.ts`.
 * Utilitaires pour la gestion de la journée commerciale
 *
 * Un bar qui ferme après minuit doit comptabiliser les ventes de la nuit
 * dans la journée précédente. Par exemple, avec une clôture à 6h du matin,
 * une vente à 3h du matin est comptée dans la journée d'hier.
 */

import { BUSINESS_DAY_CLOSE_HOUR } from '../config/constants';

/**
 * @deprecated Utilisez `calculateBusinessDate` dans `businessDateHelpers.ts`.
 * Calcule la date de la journée commerciale pour une vente donnée
 */
export function getBusinessDay(saleDate: Date, closeHour: number = BUSINESS_DAY_CLOSE_HOUR): Date {
  const businessDay = new Date(saleDate);
  const hour = saleDate.getHours();

  if (hour < closeHour) {
    businessDay.setDate(businessDay.getDate() - 1);
  }

  businessDay.setHours(0, 0, 0, 0);

  return businessDay;
}

/**
 * @deprecated Ne plus utiliser. La comparaison doit se faire sur des chaînes de caractères au format YYYY-MM-DD.
 * Vérifie si deux dates sont le même jour (sans tenir compte de l'heure)
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * @deprecated Utilisez `getCurrentBusinessDateString` dans `businessDateHelpers.ts`.
 * Obtient la journée commerciale actuelle
 */
export function getCurrentBusinessDay(closeHour: number = BUSINESS_DAY_CLOSE_HOUR): Date {
  return getBusinessDay(new Date(), closeHour);
}

/**
 * @deprecated Utilisez `filterByBusinessDateRange` dans `businessDateHelpers.ts`.
 * Filtre les ventes pour une journée commerciale donnée
 */
export function filterSalesByBusinessDay<T extends { date: string | Date }>(
  sales: T[],
  targetDay: Date,
  closeHour: number = BUSINESS_DAY_CLOSE_HOUR
): T[] {
  return sales.filter(sale => {
    const saleDate = typeof sale.date === 'string' ? new Date(sale.date) : sale.date;
    const saleBusinessDay = getBusinessDay(saleDate, closeHour);
    return isSameDay(saleBusinessDay, targetDay);
  });
}

/**
 * @deprecated Utilisez `dateToYYYYMMDD` dans `businessDateHelpers.ts`.
 * Convertit une date locale en format SQL compatible avec les vues matérialisées
 */
export function getBusinessDayDateString(date: Date = new Date(), closeHour: number = BUSINESS_DAY_CLOSE_HOUR): string {
  const businessDay = getBusinessDay(date, closeHour);
  const year = businessDay.getFullYear();
  const month = String(businessDay.getMonth() + 1).padStart(2, '0');
  const day = String(businessDay.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
