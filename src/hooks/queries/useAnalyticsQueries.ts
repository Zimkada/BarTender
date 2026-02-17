import { useQuery } from '@tanstack/react-query';
import { AnalyticsService } from '../../services/supabase/analytics.service';
import { CACHE_STRATEGY } from '../../lib/cache-strategy';

export const analyticsKeys = {
    all: ['analytics'] as const,
    dailySummary: (barId: string, start: Date, end: Date, group: string) =>
        [...analyticsKeys.all, 'dailySummary', barId, AnalyticsService.formatDate(start), AnalyticsService.formatDate(end), group] as const,
    revenueSummary: (barId: string, start: Date, end: Date) =>
        [...analyticsKeys.all, 'revenueSummary', barId, AnalyticsService.formatDate(start), AnalyticsService.formatDate(end)] as const,
    expensesSummary: (barId: string, start: Date, end: Date, group: string) =>
        [...analyticsKeys.all, 'expensesSummary', barId, AnalyticsService.formatDate(start), AnalyticsService.formatDate(end), group] as const,
    salariesSummary: (barId: string, start: Date, end: Date, group: string) =>
        [...analyticsKeys.all, 'salariesSummary', barId, AnalyticsService.formatDate(start), AnalyticsService.formatDate(end), group] as const,
};

export const useDailyAnalytics = (barId: string | undefined, startDate: Date, endDate: Date, groupBy: 'day' | 'week' | 'month' = 'day') => {
    return useQuery({
        queryKey: analyticsKeys.dailySummary(barId || '', startDate, endDate, groupBy),
        queryFn: () => AnalyticsService.getDailySummary(barId!, startDate, endDate, groupBy),
        enabled: !!barId,
        staleTime: CACHE_STRATEGY.salesAndStock.staleTime,
    });
};

export const useRevenueAnalytics = (barId: string | undefined, startDate: Date, endDate: Date) => {
    return useQuery({
        queryKey: analyticsKeys.revenueSummary(barId || '', startDate, endDate),
        queryFn: () => AnalyticsService.getRevenueSummary(barId!, startDate, endDate),
        enabled: !!barId,
        staleTime: CACHE_STRATEGY.salesAndStock.staleTime,
    });
};

export const useExpensesAnalytics = (barId: string | undefined, startDate: Date, endDate: Date, groupBy: 'month' = 'month') => {
    return useQuery({
        queryKey: analyticsKeys.expensesSummary(barId || '', startDate, endDate, groupBy),
        queryFn: () => AnalyticsService.getExpensesSummary(barId!, startDate, endDate, groupBy),
        enabled: !!barId,
        staleTime: CACHE_STRATEGY.salesAndStock.staleTime,
    });
};

export const useSalariesAnalytics = (barId: string | undefined, startDate: Date, endDate: Date, groupBy: 'month' = 'month') => {
    return useQuery({
        queryKey: analyticsKeys.salariesSummary(barId || '', startDate, endDate, groupBy),
        queryFn: () => AnalyticsService.getSalariesSummary(barId!, startDate, endDate, groupBy),
        enabled: !!barId,
        staleTime: CACHE_STRATEGY.salesAndStock.staleTime,
    });
};
