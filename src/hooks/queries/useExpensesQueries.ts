import { useQuery } from '@tanstack/react-query';
import { ExpensesService } from '../../services/supabase/expenses.service';
import { CACHE_STRATEGY } from '../../lib/cache-strategy';
import { useSmartSync } from '../useSmartSync';
import type { Expense, ExpenseCategoryCustom } from '../../types';


export const expenseKeys = {
    all: ['expenses'] as const,
    list: (barId: string) => [...expenseKeys.all, 'list', barId] as const,
    categories: (barId: string) => [...expenseKeys.all, 'categories', barId] as const,
};

export const useExpenses = (barId: string | undefined, options?: { startDate?: string; endDate?: string }) => {
    const isEnabled = !!barId;

    // 🚀 PHASE 4: Realtime Expenses Sync
    const smartSync = useSmartSync({
        table: 'expenses',
        event: '*',
        barId: barId || undefined,
        enabled: isEnabled,
        staleTime: CACHE_STRATEGY.salesAndStock.staleTime,
        refetchInterval: 60000,
        queryKeysToInvalidate: [expenseKeys.list(barId || '')]
    });

    return useQuery({
        queryKey: [...expenseKeys.list(barId || ''), options],
        queryFn: async (): Promise<Expense[]> => {
            if (!barId) return [];
            const dbExpenses = await ExpensesService.getExpenses(barId, options);

            return dbExpenses.map(e => ({
                id: e.id,
                barId: e.bar_id,
                category: e.category as any,
                customCategoryId: e.custom_category_id || undefined,
                amount: e.amount,
                description: e.description || e.notes || '',
                createdBy: e.created_by,
                date: new Date(e.expense_date),
                createdAt: new Date(e.created_at),
            }));
        },
        enabled: isEnabled,
        staleTime: CACHE_STRATEGY.salesAndStock.staleTime,
        gcTime: CACHE_STRATEGY.salesAndStock.gcTime,
        refetchInterval: smartSync.isSynced ? false : 60000, // 🚀 Hybride: Realtime ou polling 60s
    });
};

export const useCustomExpenseCategories = (barId: string | undefined) => {
    return useQuery({
        queryKey: expenseKeys.categories(barId || ''),
        queryFn: async (): Promise<ExpenseCategoryCustom[]> => {
            if (!barId) return [];
            const dbCategories = await ExpensesService.getCustomCategories(barId);

            return dbCategories.map(c => ({
                id: c.id,
                barId: c.bar_id,
                name: c.name,
                icon: c.icon || 'tag',
                createdAt: new Date(c.created_at),
                createdBy: '',
            }));
        },
        enabled: !!barId,
        staleTime: CACHE_STRATEGY.salesAndStock.staleTime,
        gcTime: CACHE_STRATEGY.salesAndStock.gcTime,
    });
};
