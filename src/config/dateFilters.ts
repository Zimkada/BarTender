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
    shortLabel: 'J',
    description: 'Journée en cours',
    type: 'quick',
    days: 0
  },
  yesterday: {
    value: 'yesterday',
    label: 'Hier',
    shortLabel: 'J-1',
    description: 'Journée précédente',
    type: 'quick',
    days: 1
  },

  // Glissant (Rolling) - Recommandé pour analytics
  last_7days: {
    value: 'last_7days',
    label: '7 derniers jours',
    shortLabel: '7J',
    description: 'Semaine glissante',
    type: 'rolling',
    days: 7
  },
  last_30days: {
    value: 'last_30days',
    label: '30 derniers jours',
    shortLabel: '30J',
    description: 'Mois glissant',
    type: 'rolling',
    days: 30
  },
  last_90days: {
    value: 'last_90days',
    label: '3 derniers mois',
    shortLabel: '90J',
    description: 'Trimestre glissant',
    type: 'rolling',
    days: 90
  },
  last_365days: {
    value: 'last_365days',
    label: '12 derniers mois',
    shortLabel: '365J',
    description: 'Année glissante',
    type: 'rolling',
    days: 365
  },

  // Calendaire
  this_week: {
    value: 'this_week',
    label: 'Cette semaine',
    shortLabel: '7J',
    description: 'Lundi - Dimanche en cours',
    type: 'calendar'
  },
  this_month: {
    value: 'this_month',
    label: 'Ce mois',
    shortLabel: 'Mois',
    description: 'Mois calendaire en cours',
    type: 'calendar'
  },
  this_year: {
    value: 'this_year',
    label: 'Cette année',
    shortLabel: 'Année',
    description: 'Année calendaire en cours',
    type: 'calendar'
  },

  // Personnalisé
  custom: {
    value: 'custom',
    label: 'Personnalisée',
    shortLabel: 'Perso',
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
 * Filtres pour accounting
 */
export const ACCOUNTING_FILTERS: TimeRange[] = [
  'today',
  'yesterday',
  'this_week',
  'this_month',
  'custom'
];

