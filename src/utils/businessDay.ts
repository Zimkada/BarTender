/**
 * Utilitaires pour la gestion de la journée commerciale
 *
 * Un bar qui ferme après minuit doit comptabiliser les ventes de la nuit
 * dans la journée précédente. Par exemple, avec une clôture à 6h du matin,
 * une vente à 3h du matin est comptée dans la journée d'hier.
 */

/**
 * Calcule la date de la journée commerciale pour une vente donnée
 *
 * @param saleDate - Date/heure de la vente
 * @param closeHour - Heure de clôture de la journée commerciale (0-23, défaut: 6h)
 * @returns Date de la journée commerciale (sans heure, juste la date)
 *
 * @example
 * // Avec closeHour = 6
 * getBusinessDay(new Date('2025-01-05 02:00'), 6) // -> 2025-01-04 (journée d'avant)
 * getBusinessDay(new Date('2025-01-05 08:00'), 6) // -> 2025-01-05 (journée actuelle)
 */
export function getBusinessDay(saleDate: Date, closeHour: number = 6): Date {
  const businessDay = new Date(saleDate);
  const hour = saleDate.getHours();

  // Si la vente est avant l'heure de clôture, c'est la journée commerciale d'avant
  if (hour < closeHour) {
    businessDay.setDate(businessDay.getDate() - 1);
  }

  // Retourner la date sans l'heure (minuit du jour)
  businessDay.setHours(0, 0, 0, 0);

  return businessDay;
}

/**
 * Vérifie si deux dates sont le même jour (sans tenir compte de l'heure)
 *
 * @param date1 - Première date
 * @param date2 - Deuxième date
 * @returns true si les deux dates sont le même jour
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * Obtient la journée commerciale actuelle
 *
 * @param closeHour - Heure de clôture de la journée commerciale (0-23, défaut: 6h)
 * @returns Date de la journée commerciale en cours
 *
 * @example
 * // Il est 3h du matin le 05/01 avec closeHour = 6
 * getCurrentBusinessDay(6) // -> 2025-01-04 (on est encore dans la journée d'hier)
 *
 * // Il est 10h du matin le 05/01 avec closeHour = 6
 * getCurrentBusinessDay(6) // -> 2025-01-05 (nouvelle journée commerciale)
 */
export function getCurrentBusinessDay(closeHour: number = 6): Date {
  return getBusinessDay(new Date(), closeHour);
}

/**
 * Filtre les ventes pour une journée commerciale donnée
 *
 * @param sales - Liste des ventes
 * @param targetDay - Date de la journée commerciale cible
 * @param closeHour - Heure de clôture de la journée commerciale
 * @returns Liste des ventes de cette journée commerciale
 */
export function filterSalesByBusinessDay<T extends { date: string | Date }>(
  sales: T[],
  targetDay: Date,
  closeHour: number = 6
): T[] {
  return sales.filter(sale => {
    const saleDate = typeof sale.date === 'string' ? new Date(sale.date) : sale.date;
    const saleBusinessDay = getBusinessDay(saleDate, closeHour);
    return isSameDay(saleBusinessDay, targetDay);
  });
}
