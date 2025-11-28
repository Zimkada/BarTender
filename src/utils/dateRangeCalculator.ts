/**
 * Utilitaire pour calculer les plages de dates selon différents filtres
 */

import { TimeRange, DateRangePeriod, PeriodComparison } from '../types/dateFilters';
import { TIME_RANGE_CONFIGS } from '../config/dateFilters';
import { BUSINESS_DAY_CLOSE_HOUR } from '../config/constants';
import { getCurrentBusinessDay } from './businessDay';

/**
 * Calcule la plage de dates pour un filtre temporel donné
 *
 * @param timeRange - Type de filtre temporel
 * @param customRange - Plage personnalisée (si timeRange = 'custom')
 * @param options - Options additionnelles
 * @returns Période avec dates de début et fin
 */
export function calculateDateRange(
  timeRange: TimeRange,
  customRange?: { start: string; end: string },
  options?: {
    includeBusinessDay?: boolean;
    closeHour?: number;
  }
): DateRangePeriod {
  const now = new Date();
  const closeHour = options?.closeHour ?? BUSINESS_DAY_CLOSE_HOUR;

  // Pour Business Day, utiliser la journée commerciale comme référence
  const referenceDate = options?.includeBusinessDay
    ? getCurrentBusinessDay(closeHour)
    : new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let startDate: Date;
  let endDate: Date;
  let label: string;

  switch (timeRange) {
    // Rapide
    case 'today': {
      startDate = new Date(referenceDate);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date();
      label = "Aujourd'hui";
      break;
    }

    case 'yesterday': {
      startDate = new Date(referenceDate);
      startDate.setDate(startDate.getDate() - 1);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setHours(23, 59, 59, 999);
      label = 'Hier';
      break;
    }

    // Glissant (Rolling)
    case 'last_7days':
    case 'last_30days':
    case 'last_90days':
    case 'last_365days': {
      const config = TIME_RANGE_CONFIGS[timeRange];
      const days = config.days || 7;

      endDate = new Date();
      startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);

      label = config.label;
      break;
    }

    // Calendaire
    case 'this_week': {
      const currentDay = referenceDate.getDay();
      const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1;

      startDate = new Date(referenceDate);
      startDate.setDate(startDate.getDate() - daysFromMonday);
      startDate.setHours(0, 0, 0, 0);

      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);

      label = 'Cette semaine';
      break;
    }

    case 'this_month': {
      startDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
      startDate.setHours(0, 0, 0, 0);

      endDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);
      endDate.setHours(23, 59, 59, 999);

      const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
        'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
      label = `${monthNames[referenceDate.getMonth()]} ${referenceDate.getFullYear()}`;
      break;
    }

    case 'this_year': {
      startDate = new Date(referenceDate.getFullYear(), 0, 1);
      startDate.setHours(0, 0, 0, 0);

      endDate = new Date(referenceDate.getFullYear(), 11, 31);
      endDate.setHours(23, 59, 59, 999);

      label = `Année ${referenceDate.getFullYear()}`;
      break;
    }

    // Personnalisé
    case 'custom': {
      if (!customRange?.start || !customRange?.end) {
        // Fallback: dernier mois par défaut
        return calculateDateRange('last_30days', undefined, options);
      }

      startDate = new Date(customRange.start);
      startDate.setHours(0, 0, 0, 0);

      endDate = new Date(customRange.end);
      endDate.setHours(23, 59, 59, 999);

      label = `Du ${formatDate(startDate)} au ${formatDate(endDate)}`;
      break;
    }

    default: {
      // Fallback sécurisé
      return calculateDateRange('last_30days', undefined, options);
    }
  }

  return { startDate, endDate, label };
}

/**
 * Calcule la période précédente de même durée pour comparaison
 *
 * @param current - Période actuelle
 * @returns Comparaison avec période précédente
 */
export function calculatePreviousPeriod(current: DateRangePeriod): PeriodComparison {
  const durationMs = current.endDate.getTime() - current.startDate.getTime();
  const durationDays = Math.ceil(durationMs / (1000 * 60 * 60 * 24));

  const previousStart = new Date(current.startDate);
  previousStart.setDate(previousStart.getDate() - durationDays);

  const previousEnd = new Date(current.endDate);
  previousEnd.setDate(previousEnd.getDate() - durationDays);

  return {
    current,
    previous: {
      startDate: previousStart,
      endDate: previousEnd,
      label: `Période précédente (${durationDays}j)`
    },
    durationDays
  };
}

/**
 * Formate une date au format court français
 */
function formatDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Convertit une Date en ISO string pour les inputs date HTML
 */
export function dateToInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
