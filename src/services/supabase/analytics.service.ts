import { supabase } from '../../lib/supabase';
import type {
    DailySalesSummaryRow,
    ExpensesSummaryRow,
    SalariesSummaryRow,
    BarStatsMultiPeriodRow,
    MaterializedViewMetricsRow,
    TopProductRpcRow,
    ViewFreshnessRow
} from './analytics.types';

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
    profit?: number;               // ✨ NOUVEAU: Profit = Revenue - (Quantity * CUMP)
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
        // Guard: Reject invalid bar IDs (null, undefined, or empty UUID)
        if (!barId || barId === '00000000-0000-0000-0000-000000000000') {
            console.warn('[AnalyticsService] getDailySummary called with invalid barId:', barId);
            return [];
        }

        const dateColumn = groupBy === 'day' ? 'sale_date' :
            groupBy === 'week' ? 'sale_week' : 'sale_month';

        const startStr = typeof startDate === 'string' ? startDate : this.formatDate(startDate);
        const endStr = typeof endDate === 'string' ? endDate : this.formatDate(endDate);

        // ✅ Type-safe query to materialized view
        const { data, error } = await supabase
            .from('daily_sales_summary')
            .select('*')
            .eq('bar_id', barId)
            .gte(dateColumn, startStr)
            .lte(dateColumn, endStr)
            .order(dateColumn, { ascending: false });

        if (error) throw error;
        return (data as DailySalesSummaryRow[]) || [];
    },

    /**
     * Récupère les top produits pour une période
     */
    async getTopProducts(
        barId: string,
        startDate: Date | string,
        endDate: Date | string,
        limit: number = 10,
        sortBy: 'quantity' | 'revenue' = 'quantity',
        serverId?: string // Optional: filter by server_id for servers
    ): Promise<TopProduct[]> {

        const startStr = typeof startDate === 'string' ? startDate : this.formatDate(startDate);
        const endStr = typeof endDate === 'string' ? endDate : this.formatDate(endDate);

        // ✨ NEW: Use server-filtered RPC when serverId is provided, otherwise use aggregated RPC
        // This ensures same product sold on different dates appears as single aggregated row
        const rpcName = serverId ? 'get_top_products_by_server' : 'get_top_products_aggregated';
        const rpcParams = serverId
            ? {
                p_bar_id: barId,
                p_start_date: startStr,
                p_end_date: endStr,
                p_server_id: serverId,
                p_limit: limit,
                p_sort_by: sortBy === 'revenue' ? 'revenue' : 'quantity'
            }
            : {
                p_bar_id: barId,
                p_start_date: startStr,
                p_end_date: endStr,
                p_limit: limit,
                p_sort_by: sortBy === 'revenue' ? 'revenue' : 'quantity'
            };

        const { data, error } = await supabase.rpc(rpcName, rpcParams);

        if (error) throw error;

        // ✅ Transform RPC response to match TopProduct interface (type-safe)
        return ((data as TopProductRpcRow[]) || []).map((row) => ({
            bar_id: barId,
            sale_date: '', // N/A for aggregated data
            sale_week: '',
            sale_month: '',
            product_id: row.product_id,
            product_name: row.product_name,
            product_volume: row.product_volume || '',
            transaction_count: row.transaction_count,
            total_quantity: row.total_quantity,
            total_revenue: row.total_revenue,
            total_quantity_returned: row.total_quantity_returned,
            total_refunded: row.total_refunded,
            avg_unit_price: row.avg_unit_price,
            profit: row.profit // ✨ NEW: Profit already calculated by RPC
        }));
    },

    /**
     * Récupère les stats multi-périodes pour un bar (dashboard rapide)
     */
    async getBarStatsMultiPeriod(barId: string): Promise<BarStatsMultiPeriodRow> {
        // ✅ Type-safe query to materialized view
        const { data, error } = await supabase
            .from('bar_stats_multi_period')
            .select('*')
            .eq('bar_id', barId)
            .single();

        if (error) throw error;
        return data as BarStatsMultiPeriodRow;
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
    async refreshAllViews(triggeredBy: string = 'manual'): Promise<unknown> {
        // ✅ Type-safe RPC call
        const { data, error } = await supabase
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
    async refreshView(viewName: string, triggeredBy: string = 'manual'): Promise<unknown> {
        // ✅ Type-safe RPC call
        const { data, error } = await supabase
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
    async getViewFreshness(viewName: string): Promise<ViewFreshnessRow | null> {
        // ✅ Type-safe RPC call
        const { data, error } = await supabase
            .rpc('get_view_freshness', {
                p_view_name: viewName
            });

        if (error) {
            console.error(`Error getting freshness for ${viewName}:`, error);
            return null;
        }

        const result = data as ViewFreshnessRow[] | null;
        return result && result.length > 0 ? result[0] : null;
    },

    /**
     * Récupère les métriques de toutes les vues matérialisées
     */
    async getViewMetrics(): Promise<MaterializedViewMetricsRow[]> {
        // ✅ Type-safe query to materialized view
        const { data, error } = await supabase
            .from('materialized_view_metrics')
            .select('*');

        if (error) {
            console.error('Error getting view metrics:', error);
            return [];
        }

        return (data as MaterializedViewMetricsRow[]) || [];
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

        // ✅ Type-safe query to materialized view
        // Format dates to match column format (YYYY-MM-DD for day, YYYY-MM for month, etc)
        const startStr = this.formatDate(startDate);
        const endStr = this.formatDate(endDate);

        const { data, error } = await supabase
            .from('expenses_summary')
            .select('*')
            .eq('bar_id', barId)
            .gte(dateColumn, startStr)
            .lte(dateColumn, endStr)
            .order(dateColumn, { ascending: false });

        if (error) throw error;
        return (data as ExpensesSummaryRow[]) || [];
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

        // ✅ Type-safe query to materialized view
        // Format dates to match column format (YYYY-MM-DD for day, YYYY-MM for month, etc)
        const startStr = this.formatDate(startDate);
        const endStr = this.formatDate(endDate);

        const { data, error } = await supabase
            .from('salaries_summary')
            .select('*')
            .eq('bar_id', barId)
            .gte(dateColumn, startStr)
            .lte(dateColumn, endStr)
            .order(dateColumn, { ascending: false });

        if (error) throw error;
        return (data as SalariesSummaryRow[]) || [];
    }
};
