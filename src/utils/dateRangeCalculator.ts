/**
 * Utilitaire pour calculer les plages de dates
 * SIMPLIFIÉ : Plus de gestion d'heures ou de décalages complexes.
 * Le backend utilise 'business_date', donc on envoie juste des dates YYYY-MM-DD.
 */

import { TimeRange, DateRangePeriod, PeriodComparison } from '../types/dateFilters';
import { TIME_RANGE_CONFIGS } from '../config/dateFilters';
import { BUSINESS_DAY_CLOSE_HOUR } from '../config/constants';

/**
 * Retourne la date "Commerciale" actuelle sous forme YYYY-MM-DD
 * Si il est 02:00 du matin et que la clôture est à 06:00, on retourne la date d'hier.
 */
export function getCurrentBusinessDateString(closeHour: number = BUSINESS_DAY_CLOSE_HOUR): string {
  const now = new Date();
  const currentHour = now.getHours();

  // Si on est avant l'heure de clôture (ex: 03h00 < 06h00), on est encore "hier"
  if (currentHour < closeHour) {
    now.setDate(now.getDate() - 1);
  }

  return dateToInputValue(now);
}

/**
 * Calcule la plage de dates pour un filtre temporel donné
 */
export function calculateDateRange(
  timeRange: TimeRange,
  customRange?: { start: string; end: string },
  options?: {
    closeHour?: number; // Juste pour déterminer "Aujourd'hui" commercialement
  }
): DateRangePeriod {
  const closeHour = options?.closeHour ?? BUSINESS_DAY_CLOSE_HOUR;

  // Date de référence = Aujourd'hui (Commercial)
  const todayStr = getCurrentBusinessDateString(closeHour);
  // ⚠️ new Date("YYYY-MM-DD") parse en UTC → décalage d'1 jour en UTC+1 (Bénin)
  // new Date(year, month, day) crée une date en heure LOCALE → correct
  const [ry, rm, rd] = todayStr.split('-').map(Number);
  const referenceDate = new Date(ry, rm - 1, rd);

  let startDate: Date;
  let endDate: Date;
  let label: string;

  switch (timeRange) {
    case 'today': {
      startDate = new Date(referenceDate);
      endDate = new Date(referenceDate);
      label = "Aujourd'hui";
      break;
    }

    case 'yesterday': {
      startDate = new Date(referenceDate);
      startDate.setDate(startDate.getDate() - 1);
      endDate = new Date(startDate);
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

      endDate = new Date(referenceDate);
      startDate = new Date(referenceDate);
      startDate.setDate(startDate.getDate() - days);

      label = config.label;
      break;
    }

    // Calendaire (Semaine Lundi-Dimanche)
    case 'this_week': {
      const currentDay = referenceDate.getDay(); // 0 = Dimanche
      const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1;

      startDate = new Date(referenceDate);
      startDate.setDate(startDate.getDate() - daysFromMonday);

      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);

      label = 'Cette semaine';
      break;
    }

    case 'this_month': {
      startDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
      endDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);

      const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
        'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
      label = `${monthNames[referenceDate.getMonth()]} ${referenceDate.getFullYear()}`;
      break;
    }

    case 'this_quarter': {
      const month = referenceDate.getMonth(); // 0-11
      const quarter = Math.floor(month / 3); // 0, 1, 2, 3
      const startMonth = quarter * 3; // 0, 3, 6, 9
      const endMonth = startMonth + 2; // 2, 5, 8, 11

      startDate = new Date(referenceDate.getFullYear(), startMonth, 1);
      endDate = new Date(referenceDate.getFullYear(), endMonth + 1, 0);

      const quarterNum = quarter + 1;
      label = `Q${quarterNum} ${referenceDate.getFullYear()}`;
      break;
    }

    case 'this_year': {
      startDate = new Date(referenceDate.getFullYear(), 0, 1);
      endDate = new Date(referenceDate.getFullYear(), 11, 31);
      label = `Année ${referenceDate.getFullYear()}`;
      break;
    }

    case 'custom': {
      if (!customRange?.start || !customRange?.end) {
        return calculateDateRange('last_30days', undefined, options);
      }
      // Même fix timezone : parser en heure locale, pas UTC
      const [sy, sm, sd] = customRange.start.split('-').map(Number);
      const [ey, em, ed] = customRange.end.split('-').map(Number);
      startDate = new Date(sy, sm - 1, sd);
      endDate = new Date(ey, em - 1, ed);
      label = `Du ${formatDate(startDate)} au ${formatDate(endDate)}`;
      break;
    }

    default: {
      return calculateDateRange('last_30days', undefined, options);
    }
  }

  // Normalisation : On s'assure que les heures sont ignorées (le backend attend des dates YYYY-MM-DD)
  // Mais pour l'objet Date JS, on met minuit/23h59 pour l'affichage UI si besoin
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);

  return { startDate, endDate, label };
}

/**
 * Calcule la période précédente de même durée
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

function formatDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

export function dateToInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
