import { supabase } from '../../lib/supabase';

export interface DailySalesSummary {
    bar_id: string;
    sale_date: string;
    sale_week: string;
    sale_month: string;
    pending_count: number;
    validated_count: number;
    rejected_count: number;
    gross_revenue: number;
    gross_subtotal: number;
    total_discounts: number;
    refunds_total: number;        // ✨ NOUVEAU
    net_revenue: number;          // ✨ NOUVEAU
    total_items_sold: number;
    avg_basket_value: number;
    cash_revenue: number;
    mobile_revenue: number;
    card_revenue: number;
    active_servers: number;
    first_sale_time: string;
    last_sale_time: string;
    updated_at: string;
}

export interface TopProduct {
    bar_id: string;
    sale_date: string;
    sale_week: string;
    sale_month: string;
    product_id: string;
    product_name: string;
    product_volume: string;
    transaction_count: number;
    total_quantity: number;       // NET (Ventes - Retours)
    total_revenue: number;        // NET (Ventes - Retours)
    total_quantity_gross?: number; // Brut
    total_revenue_gross?: number;  // Brut
    total_quantity_returned?: number;
    total_refunded?: number;
    avg_unit_price: number;
}

export interface ExpensesSummary {
    bar_id: string;
    expense_date: string;
    expense_week: string;
    expense_month: string;
    total_expenses: number;
    operating_expenses: number;
    investments: number;
    water_expenses: number;
    electricity_expenses: number;
    maintenance_expenses: number;
    supply_expenses: number;
    supplies_cost: number;        // ✨ NOUVEAU
    custom_expenses: number;
    expense_count: number;
    investment_count: number;
    supply_count: number;         // ✨ NOUVEAU
    first_expense_time: string;
    last_expense_time: string;
    updated_at: string;
}

export interface SalariesSummary {
    bar_id: string;
    payment_date: string;
    payment_week: string;
    payment_month: string;
    total_salaries: number;
    payment_count: number;
    unique_members_paid: number;
    avg_salary_amount: number;
    min_salary_amount: number;
    max_salary_amount: number;
    first_payment_time: string;
    last_payment_time: string;
    updated_at: string;
}

export const AnalyticsService = {
    formatDate(d: Date): string {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    /**
     * Récupère le résumé des ventes par jour/semaine/mois
     */
    async getDailySummary(
        barId: string,
        startDate: Date | string,
        endDate: Date | string,
        groupBy: 'day' | 'week' | 'month' = 'day'
    ): Promise<DailySalesSummary[]> {
        const dateColumn = groupBy === 'day' ? 'sale_date' :
            groupBy === 'week' ? 'sale_week' : 'sale_month';

        const startStr = typeof startDate === 'string' ? startDate : this.formatDate(startDate);
        const endStr = typeof endDate === 'string' ? endDate : this.formatDate(endDate);

        const { data, error } = await supabase
            .from('daily_sales_summary' as any)
            .select('*')
            .eq('bar_id', barId)
            .gte(dateColumn, startStr)
            .lte(dateColumn, endStr)
            .order(dateColumn, { ascending: false });

        if (error) throw error;
        return (data as any) || [];
    },

    /**
     * Récupère les top produits pour une période
     */
    async getTopProducts(
        barId: string,
        startDate: Date | string,
        endDate: Date | string,
        limit: number = 10,
        sortBy: 'quantity' | 'revenue' = 'quantity'
    ): Promise<TopProduct[]> {

        const startStr = typeof startDate === 'string' ? startDate : this.formatDate(startDate);
        const endStr = typeof endDate === 'string' ? endDate : this.formatDate(endDate);

        const sortColumn = sortBy === 'revenue' ? 'total_revenue' : 'total_quantity';

        const { data, error } = await supabase
            .from('top_products_by_period' as any)
            .select('*')
            .eq('bar_id', barId)
            .gte('sale_date', startStr)
            .lte('sale_date', endStr)
            .order(sortColumn, { ascending: false })
            .limit(limit);

        if (error) throw error;
        return (data as any) || [];
    },

    /**
     * Récupère les stats multi-périodes pour un bar (dashboard rapide)
     */
    async getBarStatsMultiPeriod(barId: string) {
        const { data, error } = await supabase
            .from('bar_stats_multi_period' as any)
            .select('*')
            .eq('bar_id', barId)
            .single();

        if (error) throw error;
        return data;
    },

    /**
     * Calcule le CA pour une période spécifique (pour AccountingOverview)
     */
    async getRevenueSummary(
        barId: string,
        startDate: Date,
        endDate: Date
    ): Promise<{
        totalRevenue: number;
        totalSales: number;
        avgBasketValue: number;
        cashRevenue: number;
        mobileRevenue: number;
        cardRevenue: number;
    }> {
        const summaries = await this.getDailySummary(barId, startDate, endDate);

        return {
            totalRevenue: summaries.reduce((sum, s) => sum + (s.net_revenue || 0), 0),
            totalSales: summaries.reduce((sum, s) => sum + s.validated_count, 0),
            avgBasketValue: summaries.length > 0
                ? summaries.reduce((sum, s) => sum + s.avg_basket_value, 0) / summaries.length
                : 0,
            cashRevenue: summaries.reduce((sum, s) => sum + s.cash_revenue, 0),
            mobileRevenue: summaries.reduce((sum, s) => sum + s.mobile_revenue, 0),
            cardRevenue: summaries.reduce((sum, s) => sum + s.card_revenue, 0),
        };
    },

    /**
     * Rafraîchit toutes les vues matérialisées (Cache Warming)
     */
    async refreshAllViews(triggeredBy: string = 'manual'): Promise<any> {
        const { data, error } = await (supabase as any)
            .rpc('refresh_all_materialized_views', {
                p_triggered_by: triggeredBy
            });

        if (error) {
            console.error('Error refreshing views:', error);
            throw error;
        }

        return data;
    },

    /**
     * Rafraîchit une vue matérialisée spécifique
     */
    async refreshView(viewName: string, triggeredBy: string = 'manual'): Promise<any> {
        const { data, error } = await (supabase as any)
            .rpc('refresh_materialized_view_with_logging', {
                p_view_name: viewName,
                p_triggered_by: triggeredBy
            });

        if (error) {
            console.error(`Error refreshing view ${viewName}:`, error);
            throw error;
        }

        return data;
    },

    /**
     * Récupère la fraîcheur d'une vue matérialisée
     */
    async getViewFreshness(viewName: string): Promise<{
        view_name: string;
        last_refresh: string | null;
        minutes_old: number;
        is_stale: boolean;
    } | null> {
        const { data, error } = await (supabase as any)
            .rpc('get_view_freshness', {
                p_view_name: viewName
            });

        if (error) {
            console.error(`Error getting freshness for ${viewName}:`, error);
            return null;
        }

        return data && data.length > 0 ? data[0] : null;
    },

    /**
     * Récupère les métriques de toutes les vues matérialisées
     */
    async getViewMetrics(): Promise<any[]> {
        const { data, error } = await (supabase as any)
            .from('materialized_view_metrics')
            .select('*');

        if (error) {
            console.error('Error getting view metrics:', error);
            return [];
        }

        return data || [];
    },

    /**
     * Récupère le résumé des dépenses par jour/semaine/mois
     */
    async getExpensesSummary(
        barId: string,
        startDate: Date,
        endDate: Date,
        groupBy: 'day' | 'week' | 'month' = 'day'
    ): Promise<ExpensesSummary[]> {
        const dateColumn = groupBy === 'day' ? 'expense_date' :
            groupBy === 'week' ? 'expense_week' : 'expense_month';

        const { data, error } = await supabase
            .from('expenses_summary' as any)
            .select('*')
            .eq('bar_id', barId)
            .gte(dateColumn, startDate.toISOString())
            .lte(dateColumn, endDate.toISOString())
            .order(dateColumn, { ascending: false });

        if (error) throw error;
        return (data as any) || [];
    },

    /**
     * Récupère le résumé des salaires par jour/semaine/mois
     */
    async getSalariesSummary(
        barId: string,
        startDate: Date,
        endDate: Date,
        groupBy: 'day' | 'week' | 'month' = 'day'
    ): Promise<SalariesSummary[]> {
        const dateColumn = groupBy === 'day' ? 'payment_date' :
            groupBy === 'week' ? 'payment_week' : 'payment_month';

        const { data, error } = await supabase
            .from('salaries_summary' as any)
            .select('*')
            .eq('bar_id', barId)
            .gte(dateColumn, startDate.toISOString())
            .lte(dateColumn, endDate.toISOString())
            .order(dateColumn, { ascending: false });

        if (error) throw error;
        return (data as any) || [];
    }
};
