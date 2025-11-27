/**
 * CONSTANTE BUSINESS DAY
 *
 * Heure de clôture de la journée commerciale fixée à 6h du matin.
 * Cette valeur est synchronisée avec les vues SQL matérialisées (INTERVAL '6 hours').
 *
 * IMPORTANT:
 * - Toute modification de cette valeur nécessite une migration SQL
 * - Les migrations concernées: 058_standardize_business_day_to_6h.sql
 * - Vues impactées: daily_sales_summary_mat, top_products_by_period_mat
 *
 * LOGIQUE MÉTIER:
 * - Une vente faite AVANT 6h du matin est comptée dans la journée PRÉCÉDENTE
 * - Une vente faite APRÈS 6h du matin est comptée dans la journée ACTUELLE
 *
 * EXEMPLES:
 * - Vente à 02:00 le 27/11 → Comptée le 26/11 (journée commerciale précédente)
 * - Vente à 08:00 le 27/11 → Comptée le 27/11 (journée commerciale actuelle)
 *
 * RATIONALE DU CHOIX DE 6H:
 * - 4h était trop tôt (bars normaux ferment entre 3h-5h)
 * - 6h couvre 90% des cas d'usage (bars + nightclubs)
 * - Nightclubs fermant après 8h ont un décalage acceptable de 2h
 * - Compromis optimal entre simplicité et précision
 */
export const BUSINESS_DAY_CLOSE_HOUR = 6;

/**
 * Type pour forcer l'utilisation de la constante
 * Empêche l'utilisation de valeurs hardcodées ailleurs
 */
export type BusinessDayCloseHour = typeof BUSINESS_DAY_CLOSE_HOUR;
