import { supabase } from '../../lib/supabase';

export interface ProductSalesStats {
    product_id: string;
    bar_id: string;
    product_name: string;
    product_volume: string;
    current_stock: number;
    alert_threshold: number;
    cost_price: number;
    selling_price: number;
    product_created_at: string;
    days_with_sales: number;
    total_transactions: number;
    total_sold_30d: number;
    daily_average: number;
    days_since_creation: number;
    last_sale_date: string | null;
    days_without_sale: number | null;
    avg_purchase_cost: number;
    updated_at: string;
}

export interface OrderSuggestion {
    productId: string;
    productName: string;
    productVolume: string;
    currentStock: number;
    suggestedQuantity: number;
    estimatedCost: number;
    urgency: 'high' | 'medium' | 'low';
    reasoning: string;
}

export const ForecastingService = {
    /**
     * Récupère les statistiques de ventes pré-calculées pour un bar
     */
    async getProductSalesStats(barId: string): Promise<ProductSalesStats[]> {
        const { data, error } = await supabase
            .from('product_sales_stats' as any)
            .select('*')
            .eq('bar_id', barId)
            .order('daily_average', { ascending: false });

        if (error) throw error;
        return (data as any) || [];
    },

    /**
     * Calcule la suggestion de commande pour un produit
     */
    calculateOrderSuggestion(
        stats: ProductSalesStats,
        coverageDays: number
    ): OrderSuggestion {
        let suggestedQuantity = 0;
        let reasoning = '';
        let urgency: 'high' | 'medium' | 'low' = 'low';

        // Cas 1: Produit récent (moins de 30 jours d'existence)
        if (stats.days_since_creation < 30) {
            const adjustedDays = Math.max(stats.days_since_creation, 1);
            const adjustedAverage = stats.total_sold_30d / adjustedDays;
            const coverageNeeds = adjustedAverage * coverageDays;

            suggestedQuantity = Math.ceil(coverageNeeds + stats.alert_threshold - stats.current_stock);
            reasoning = `Produit récent (${Math.floor(stats.days_since_creation)}j). Moyenne ajustée: ${adjustedAverage.toFixed(1)}/jour sur ${stats.days_with_sales}j de ventes`;
            urgency = stats.current_stock <= stats.alert_threshold ? 'high' : 'medium';
        }
        // Cas 2: Rupture de stock prolongée (pas de ventes depuis 7+ jours)
        else if (stats.days_without_sale && stats.days_without_sale > 7) {
            suggestedQuantity = Math.max(0, stats.alert_threshold - stats.current_stock);
            reasoning = `⚠️ Rupture depuis ${Math.floor(stats.days_without_sale)}j. Reconstitution stock de sécurité uniquement`;
            urgency = stats.current_stock === 0 ? 'medium' : 'low';
        }
        // Cas 3: Calcul standard basé sur moyenne journalière réelle
        else {
            if (stats.days_with_sales === 0 || stats.daily_average === 0) {
                suggestedQuantity = 0;
                reasoning = 'Aucune vente récente. Pas de suggestion.';
                urgency = 'low';
            } else {
                const coverageNeeds = stats.daily_average * coverageDays;
                suggestedQuantity = Math.ceil(coverageNeeds + stats.alert_threshold - stats.current_stock);
                reasoning = `Basé sur ${stats.days_with_sales}j de ventes réelles. Moyenne: ${stats.daily_average.toFixed(1)}/jour`;

                // Déterminer urgence
                if (stats.current_stock === 0) {
                    urgency = 'high';
                } else if (stats.current_stock <= stats.alert_threshold / 2) {
                    urgency = 'high';
                } else if (stats.current_stock <= stats.alert_threshold) {
                    urgency = 'medium';
                } else {
                    urgency = 'low';
                }
            }
        }

        // Estimer le coût
        const estimatedCost = Math.max(0, suggestedQuantity) * stats.avg_purchase_cost;

        return {
            productId: stats.product_id,
            productName: stats.product_name,
            productVolume: stats.product_volume,
            currentStock: stats.current_stock,
            suggestedQuantity: Math.max(0, suggestedQuantity),
            estimatedCost,
            urgency,
            reasoning
        };
    },

    /**
     * Rafraîchir les statistiques manuellement
     */
    async refreshStats(): Promise<void> {
        const { error } = await supabase.rpc('refresh_product_sales_stats' as any);
        if (error) throw error;
    }
};
