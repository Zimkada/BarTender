import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ExpensesService } from '../../services/supabase/expenses.service';
import { expenseKeys } from '../queries/useExpensesQueries';
import { AnalyticsService } from '../../services/supabase/analytics.service';

export const useExpensesMutations = (barId: string) => {
    const queryClient = useQueryClient();

    const createExpense = useMutation({
        mutationFn: async (data: any) => {
            // Mapping App -> DB
            const expenseData = {
                bar_id: data.barId,
                category: data.category,
                custom_category_id: data.customCategoryId,
                amount: data.amount,
                description: data.description,
                created_by: data.createdBy,
                expense_date: data.date ? data.date.toISOString() : new Date().toISOString(),
            };
            return ExpensesService.createExpense(expenseData);
        },
        onSuccess: async () => {
            try {
                // 🔄 Syncing Analytics View BEFORE invalidating cache
                // This prevents "Race Condition" identified in certification analysis
                await AnalyticsService.refreshView('expenses_summary');
            } catch (e) {
                console.error('[useExpensesMutations] Failed to refresh analytics view:', e);
            }

            import('react-hot-toast').then(({ default: toast }) => {
                toast.success('Dépense enregistrée');
            });

            queryClient.invalidateQueries({ queryKey: expenseKeys.list(barId) });
        },
    });

    const deleteExpense = useMutation({
        mutationFn: ExpensesService.deleteExpense,
        onSuccess: async () => {
            try {
                await AnalyticsService.refreshView('expenses_summary');
            } catch (e) {
                console.error('[useExpensesMutations] Failed to refresh analytics view:', e);
            }

            import('react-hot-toast').then(({ default: toast }) => {
                toast.success('Dépense supprimée');
            });

            queryClient.invalidateQueries({ queryKey: expenseKeys.list(barId) });
        },
    });


    const createCustomCategory = useMutation({
        mutationFn: async (data: any) => {
            const categoryData = {
                bar_id: barId,
                name: data.name,
                color: '#6B7280', // Default color
                is_active: true,
                created_by: data.createdBy || ''
            };
            return ExpensesService.createCustomCategory(categoryData);
        },
        onSuccess: () => {
            import('react-hot-toast').then(({ default: toast }) => {
                toast.success('Catégorie créée');
            });
            queryClient.invalidateQueries({ queryKey: expenseKeys.categories(barId) });
        },
    });

    return {
        createExpense,
        deleteExpense,
        createCustomCategory,
    };
};
