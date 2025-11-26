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
    total_quantity: number;
    total_revenue: number;
    avg_unit_price: number;
}

export const AnalyticsService = {
    /**
     * Récupère le résumé des ventes par jour/semaine/mois
     */
    async getDailySummary(
        barId: string,
        startDate: Date,
        endDate: Date,
        groupBy: 'day' | 'week' | 'month' = 'day'
    ): Promise<DailySalesSummary[]> {
        const dateColumn = groupBy === 'day' ? 'sale_date' :
            groupBy === 'week' ? 'sale_week' : 'sale_month';

        const { data, error } = await supabase
            .from('daily_sales_summary' as any)
            .select('*')
            .eq('bar_id', barId)
            .gte(dateColumn, startDate.toISOString())
            .lte(dateColumn, endDate.toISOString())
            .order(dateColumn, { ascending: false });

        if (error) throw error;
        return (data as any) || [];
    },

    /**
     * Récupère les top produits pour une période
     */
    async getTopProducts(
        barId: string,
        startDate: Date,
        endDate: Date,
        limit: number = 10
    ): Promise<TopProduct[]> {
        const { data, error } = await supabase
            .from('top_products_by_period' as any)
            .select('*')
            .eq('bar_id', barId)
            .gte('sale_date', startDate.toISOString().split('T')[0])
            .lte('sale_date', endDate.toISOString().split('T')[0])
            .order('total_quantity', { ascending: false })
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
            totalRevenue: summaries.reduce((sum, s) => sum + s.gross_revenue, 0),
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
    }
};
