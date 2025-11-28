/**
 * Constantes globales de l'application BarTender
 */

/**
 * BUSINESS DAY CLOSE HOUR
 *
 * Heure de clôture de la journée commerciale (0-23).
 * Les ventes effectuées avant cette heure sont comptabilisées
 * dans la journée commerciale précédente.
 *
 * Exemple avec closeHour = 6:
 * - Vente à 3h du matin le 28/11 → Comptée le 27/11
 * - Vente à 10h du matin le 28/11 → Comptée le 28/11
 *
 * ⚠️ IMPORTANT : Cette valeur DOIT correspondre à INTERVAL dans les migrations SQL
 * Migration de référence: 058_standardize_business_day_to_6h.sql
 * SQL: DATE(created_at - INTERVAL '6 hours')
 *
 * @constant {number}
 */
export const BUSINESS_DAY_CLOSE_HOUR = 6;

/**
 * Timezone de l'application
 * Bénin (Cotonou) = UTC+1
 */
export const APP_TIMEZONE = 'Africa/Porto-Novo';

/**
 * Configuration devise
 */
export const CURRENCY = {
  code: 'XOF',
  symbol: 'FCFA',
  name: 'Franc CFA',
} as const;
