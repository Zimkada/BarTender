/**
 * Types pour les vues matérialisées Supabase (non présentes dans database.types)
 * Ces vues sont créées côté DB pour optimiser les requêtes analytics
 */

import type { Database } from '../../lib/database.types';

/**
 * Vue matérialisée : daily_sales_summary
 */
export interface DailySalesSummaryRow {
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
    refunds_total: number;
    net_revenue: number;
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

/**
 * Vue matérialisée : expenses_summary
 */
export interface ExpensesSummaryRow {
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
    supplies_cost: number;
    custom_expenses: number;
    expense_count: number;
    investment_count: number;
    supply_count: number;
    first_expense_time: string;
    last_expense_time: string;
    updated_at: string;
}

/**
 * Vue matérialisée : salaries_summary
 */
export interface SalariesSummaryRow {
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

/**
 * Vue matérialisée : bar_stats_multi_period
 */
export interface BarStatsMultiPeriodRow {
    bar_id: string;
    [key: string]: unknown; // Flexible pour les champs dynamiques
}

/**
 * Vue matérialisée : materialized_view_metrics
 */
export interface MaterializedViewMetricsRow {
    view_name: string;
    last_refresh: string | null;
    minutes_old: number;
    is_stale: boolean;
    [key: string]: unknown; // Champs supplémentaires possibles
}

/**
 * Réponse RPC : get_top_products_aggregated / get_top_products_by_server
 */
export interface TopProductRpcRow {
    product_id: string;
    product_name: string;
    product_volume: string | null;
    transaction_count: number;
    total_quantity: number;
    total_revenue: number;
    total_quantity_returned: number | null;
    total_refunded: number | null;
    avg_unit_price: number;
    profit: number | null;
}

/**
 * Réponse RPC : get_view_freshness
 */
export interface ViewFreshnessRow {
    view_name: string;
    last_refresh: string | null;
    minutes_old: number;
    is_stale: boolean;
}

/**
 * Extension du type Database pour inclure les vues matérialisées
 * Permet d'utiliser supabase.from('view_name') de manière type-safe
 */
export type DatabaseWithViews = Database & {
    public: Database['public'] & {
        Views: {
            daily_sales_summary: {
                Row: DailySalesSummaryRow;
            };
            expenses_summary: {
                Row: ExpensesSummaryRow;
            };
            salaries_summary: {
                Row: SalariesSummaryRow;
            };
            bar_stats_multi_period: {
                Row: BarStatsMultiPeriodRow;
            };
            materialized_view_metrics: {
                Row: MaterializedViewMetricsRow;
            };
        };
    };
};
