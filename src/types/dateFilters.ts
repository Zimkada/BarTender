/**
 * Types pour les filtres temporels réutilisables
 */

/**
 * Plages temporelles disponibles
 *
 * Glissant (rolling) : Calcul à partir d'aujourd'hui - N jours
 * Calendaire : Périodes fixes (semaine en cours, mois en cours, etc.)
 */
export type TimeRange =
  // Rapide
  | 'today'           // Aujourd'hui
  | 'yesterday'       // Hier
  // Glissant (recommandé pour analytics)
  | 'last_7days'      // 7 derniers jours
  | 'last_30days'     // 30 derniers jours
  | 'last_90days'     // 90 derniers jours (3 mois)
  | 'last_365days'    // 365 derniers jours (12 mois)
  // Calendaire
  | 'this_week'       // Cette semaine (Lun-Dim)
  | 'this_month'      // Ce mois
  | 'this_quarter'    // Ce trimestre
  | 'this_year'       // Cette année
  // Personnalisé
  | 'custom';

/**
 * Configuration d'un filtre temporel
 */
export interface TimeRangeConfig {
  value: TimeRange;
  label: string;
  shortLabel?: string;
  description?: string;
  days?: number;  // Pour filtres glissants
  type: 'quick' | 'rolling' | 'calendar' | 'custom';
}

/**
 * Période calculée avec dates de début et fin
 */
export interface DateRangePeriod {
  startDate: Date;
  endDate: Date;
  label: string;  // Ex: "7 derniers jours", "Novembre 2025"
}

/**
 * Options pour le hook useDateRangeFilter
 */
export interface DateRangeFilterOptions {
  defaultRange?: TimeRange;
  includeBusinessDay?: boolean;
  closeHour?: number;
  enableComparison?: boolean;  // Pour calculer période précédente
}

/**
 * Résultat de la comparaison avec période précédente
 */
export interface PeriodComparison {
  current: DateRangePeriod;
  previous: DateRangePeriod;
  durationDays: number;
}
