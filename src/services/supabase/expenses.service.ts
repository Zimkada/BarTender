import { supabase, handleSupabaseError } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';

type Expense = Database['public']['Tables']['expenses']['Row'];
type ExpenseInsert = Database['public']['Tables']['expenses']['Insert'];
type ExpenseCategoryCustom = Database['public']['Tables']['expense_categories_custom']['Row'];
type ExpenseCategoryCustomInsert = Database['public']['Tables']['expense_categories_custom']['Insert'];

export class ExpensesService {
    /**
     * Créer une dépense
     */
    static async createExpense(data: ExpenseInsert): Promise<Expense> {
        try {
            const { data: newExpense, error } = await supabase
                .from('expenses')
                .insert(data)
                .select()
                .single();

            if (error) throw error;
            return newExpense;
        } catch (error) {
            throw new Error(handleSupabaseError(error));
        }
    }

    /**
     * Récupérer les dépenses d'un bar
     */
    static async getExpenses(barId: string): Promise<Expense[]> {
        try {
            const { data, error } = await supabase
                .from('expenses')
                .select('*')
                .eq('bar_id', barId)
                .order('expense_date', { ascending: false });

            if (error) throw error;
            return data || [];
        } catch (error) {
            throw new Error(handleSupabaseError(error));
        }
    }

    /**
     * Supprimer une dépense
     */
    static async deleteExpense(id: string): Promise<void> {
        try {
            const { error } = await supabase
                .from('expenses')
                .delete()
                .eq('id', id);

            if (error) throw error;
        } catch (error) {
            throw new Error(handleSupabaseError(error));
        }
    }

    // --- CUSTOM CATEGORIES ---

    /**
     * Créer une catégorie de dépense personnalisée
     */
    static async createCustomCategory(data: ExpenseCategoryCustomInsert): Promise<ExpenseCategoryCustom> {
        try {
            const { data: newCategory, error } = await supabase
                .from('expense_categories_custom')
                .insert(data)
                .select()
                .single();

            if (error) throw error;
            return newCategory;
        } catch (error) {
            throw new Error(handleSupabaseError(error));
        }
    }

    /**
     * Récupérer les catégories personnalisées d'un bar
     */
    static async getCustomCategories(barId: string): Promise<ExpenseCategoryCustom[]> {
        try {
            const { data, error } = await supabase
                .from('expense_categories_custom')
                .select('*')
                .eq('bar_id', barId)
                .eq('is_active', true);

            if (error) throw error;
            return data || [];
        } catch (error) {
            throw new Error(handleSupabaseError(error));
        }
    }
}
