/**
 * Configuration des filtres temporels
 */

import { TimeRange, TimeRangeConfig } from '../types/dateFilters';

/**
 * Configurations de tous les filtres temporels disponibles
 */
export const TIME_RANGE_CONFIGS: Record<TimeRange, TimeRangeConfig> = {
  // Rapide
  today: {
    value: 'today',
    label: "Aujourd'hui",
    shortLabel: "Auj.",
    mediumLabel: "Aujourd'hui",
    description: 'Journée en cours',
    type: 'quick',
    days: 0
  },
  yesterday: {
    value: 'yesterday',
    label: 'Hier',
    shortLabel: 'Hier',
    mediumLabel: 'Hier',
    description: 'Journée précédente',
    type: 'quick',
    days: 1
  },

  // Glissant (Rolling) — fenêtres mobiles, pas liées au calendrier
  last_7days: {
    value: 'last_7days',
    label: '7 derniers jours',
    shortLabel: '7j',
    mediumLabel: '7 jours',
    description: '7 jours glissants',
    type: 'rolling',
    days: 7
  },
  last_30days: {
    value: 'last_30days',
    label: '30 derniers jours',
    shortLabel: '30j',
    mediumLabel: '30 jours',
    description: '30 jours glissants',
    type: 'rolling',
    days: 30
  },
  last_90days: {
    value: 'last_90days',
    label: '3 derniers mois',
    shortLabel: '90j',
    mediumLabel: '90 jours',
    description: '90 jours glissants',
    type: 'rolling',
    days: 90
  },
  last_365days: {
    value: 'last_365days',
    label: '12 derniers mois',
    shortLabel: '365j',
    mediumLabel: '12 mois',
    description: '365 jours glissants',
    type: 'rolling',
    days: 365
  },

  // Calendaire — périodes fixes (lun-dim, jan-déc, etc.)
  this_week: {
    value: 'this_week',
    label: 'Cette semaine',
    shortLabel: 'Semaine',
    mediumLabel: 'Cette semaine',
    description: 'Lundi - Dimanche en cours',
    type: 'calendar'
  },
  this_month: {
    value: 'this_month',
    label: 'Ce mois',
    shortLabel: 'Mois',
    mediumLabel: 'Ce mois',
    description: 'Mois calendaire en cours',
    type: 'calendar'
  },
  this_quarter: {
    value: 'this_quarter',
    label: 'Ce trimestre',
    shortLabel: 'Trim.',
    mediumLabel: 'Ce trimestre',
    description: 'Trimestre calendaire en cours',
    type: 'calendar'
  },
  this_year: {
    value: 'this_year',
    label: 'Cette année',
    shortLabel: 'Année',
    mediumLabel: 'Cette année',
    description: 'Année calendaire en cours',
    type: 'calendar'
  },

  // Personnalisé
  custom: {
    value: 'custom',
    label: 'Personnalisée',
    shortLabel: 'Perso',
    mediumLabel: 'Personnalisée',
    description: 'Choisir dates de début et fin',
    type: 'custom'
  }
};

/**
 * Filtres rapides pour l'UI (les plus utilisés)
 */
export const QUICK_FILTERS: TimeRange[] = [
  'today',
  'last_7days',
  'last_30days',
  'custom'
];

/**
 * Filtres pour promotions analytics
 */
export const PROMOTIONS_FILTERS: TimeRange[] = [
  'today',
  'last_7days',
  'last_30days',
  'last_365days',
  'custom'
];

/**
 * Filtres pour sales history
 */
export const SALES_HISTORY_FILTERS: TimeRange[] = [
  'today',
  'yesterday',
  'last_7days',
  'last_30days',
  'custom'
];

/**
 * Filtres pour accounting — tous écrans (trimestre et année inclus)
 */
export const ACCOUNTING_FILTERS: TimeRange[] = [
  'today',
  'yesterday',
  'this_week',
  'this_month',
  'this_quarter',
  'this_year',
  'custom'
];

