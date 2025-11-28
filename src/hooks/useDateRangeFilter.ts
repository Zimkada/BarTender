/**
 * Hook réutilisable pour gérer les filtres temporels
 * Utilisé dans SalesHistory, PromotionsAnalytics, AccountingOverview, etc.
 */

import { useState, useMemo, useCallback } from 'react';
import {
  TimeRange,
  DateRangePeriod,
  DateRangeFilterOptions,
  PeriodComparison
} from '../types/dateFilters';
import {
  calculateDateRange,
  calculatePreviousPeriod,
  dateToInputValue
} from '../utils/dateRangeCalculator';

/**
 * Hook pour gérer les filtres de plage temporelle
 *
 * @param options - Options de configuration
 * @returns État et fonctions pour gérer les filtres
 *
 * @example
 * ```tsx
 * // Dans PromotionsAnalytics
 * const { timeRange, setTimeRange, startDate, endDate, periodLabel } = useDateRangeFilter({
 *   defaultRange: 'last_30days'
 * });
 *
 * // Dans SalesHistory (avec Business Day)
 * const filter = useDateRangeFilter({
 *   defaultRange: 'today',
 *   includeBusinessDay: true
 * });
 * ```
 */
export function useDateRangeFilter(options?: DateRangeFilterOptions) {
  const {
    defaultRange = 'last_30days',
    includeBusinessDay = false,
    closeHour,
    enableComparison = false
  } = options || {};

  // État
  const [timeRange, setTimeRange] = useState<TimeRange>(defaultRange);
  const [customRange, setCustomRange] = useState({
    start: dateToInputValue(new Date()),
    end: dateToInputValue(new Date())
  });

  // Calcul de la période actuelle
  const currentPeriod = useMemo<DateRangePeriod>(() => {
    return calculateDateRange(timeRange, customRange, {
      includeBusinessDay,
      closeHour
    });
  }, [timeRange, customRange, includeBusinessDay, closeHour]);

  // Calcul de la période précédente (pour comparaison)
  const comparison = useMemo<PeriodComparison | null>(() => {
    if (!enableComparison) return null;
    return calculatePreviousPeriod(currentPeriod);
  }, [currentPeriod, enableComparison]);

  // Fonctions helpers
  const isActive = useCallback((range: TimeRange) => {
    return timeRange === range;
  }, [timeRange]);

  const updateCustomRange = useCallback((field: 'start' | 'end', value: string) => {
    setCustomRange(prev => ({ ...prev, [field]: value }));
  }, []);

  const resetToDefault = useCallback(() => {
    setTimeRange(defaultRange);
    setCustomRange({
      start: dateToInputValue(new Date()),
      end: dateToInputValue(new Date())
    });
  }, [defaultRange]);

  return {
    // État
    timeRange,
    setTimeRange,
    customRange,
    updateCustomRange,
    setCustomRange,

    // Périodes calculées
    startDate: currentPeriod.startDate,
    endDate: currentPeriod.endDate,
    periodLabel: currentPeriod.label,
    currentPeriod,

    // Comparaison (si activée)
    comparison,
    previousStartDate: comparison?.previous.startDate,
    previousEndDate: comparison?.previous.endDate,

    // Helpers
    isActive,
    resetToDefault,
    isCustom: timeRange === 'custom'
  };
}
