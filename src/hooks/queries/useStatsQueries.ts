// src/hooks/queries/useStatsQueries.ts

const baseKey = 'stats';

export const statsKeys = {
  all: (barId: string) => [baseKey, barId] as const,
  summaries: (barId: string) => [...statsKeys.all(barId), 'summaries'] as const,
  summary: (
    barId: string,
    startDate: Date | string,
    endDate: Date | string,
    operatingMode?: string,
    isServerRole?: boolean,
    userId?: string
  ) => [...statsKeys.summaries(barId), { startDate, endDate, operatingMode, isServerRole, userId }] as const,
  details: (barId: string) => [...statsKeys.all(barId), 'details'] as const,
  detail: (barId: string, statId: string) =>
    [...statsKeys.details(barId), statId] as const,
};
