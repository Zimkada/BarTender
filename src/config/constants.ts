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

/**
 * Vues matérialisées attendues — DOIT correspondre exactement à la liste dans
 * refresh_all_materialized_views (migration 20260607160000_optimize_materialized_view_refresh.sql).
 * ⚠️ Si la liste SQL change, mettre à jour ici en même temps.
 * salaries_summary exclu intentionnellement (vue normale, toujours fraîche).
 * top_products_by_period exclu le 2026-06-07 (vue morte : dashboard via RPC
 *   get_top_products_aggregated qui lit les tables brutes, jamais cette vue).
 */
export const EXPECTED_MATERIALIZED_VIEWS = [
  'product_sales_stats',
  'daily_sales_summary',
  'expenses_summary',
  'bar_stats_multi_period',
  'bar_ancillary_stats',
] as const;
