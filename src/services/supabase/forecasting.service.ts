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
     *
     * @note La vue matérialisée product_sales_stats n'est pas incluse dans les types générés
     * car elle est créée dynamiquement via migration SQL.
     */
    async getProductSalesStats(barId: string): Promise<ProductSalesStats[]> {
        // @ts-expect-error - Vue matérialisée product_sales_stats non incluse dans les types générés
        const { data, error } = await supabase
            .from('product_sales_stats')
            .select('*')
            .eq('bar_id', barId)
            .order('daily_average', { ascending: false });

        if (error) throw error;

        // ✅ Type-safe return with explicit ProductSalesStats[] interface
        return (data as ProductSalesStats[]) || [];
    },

    /**
     * Calcule la suggestion de commande pour un produit
     */
    calculateOrderSuggestion(
        stats: ProductSalesStats,
        coverageDays: number,
        overrideCurrentStock?: number // ✨ NEW: Permet d'injecter le stock disponible
    ): OrderSuggestion {
        const currentStock = overrideCurrentStock !== undefined ? overrideCurrentStock : stats.current_stock;
        let suggestedQuantity = 0;
        let reasoning = '';
        let urgency: 'high' | 'medium' | 'low' = 'low';

        // Utiliser la moyenne lissée de la DB
        const dailyAverage = stats.daily_average;

        // Cas 1: Produit trop récent ou pas assez de recul
        if (stats.days_since_creation < 2) {
            suggestedQuantity = Math.max(0, stats.alert_threshold - currentStock);
            reasoning = `Produit très récent. Reconstitution stock de sécurité uniquement.`;
            urgency = currentStock <= stats.alert_threshold ? 'medium' : 'low';
        }
        // Cas 2: Rupture de stock prolongée (pas de ventes depuis 7+ jours)
        else if (stats.days_without_sale && stats.days_without_sale > 7) {
            suggestedQuantity = Math.max(0, stats.alert_threshold - currentStock);
            reasoning = `⚠️ Rupture depuis ${Math.floor(stats.days_without_sale)}j. Reconstitution stock de sécurité uniquement`;
            urgency = currentStock === 0 ? 'medium' : 'low';
        }
        // Cas 3: Calcul standard basé sur moyenne journalière lissée
        else {
            if (dailyAverage === 0) {
                suggestedQuantity = 0;
                reasoning = 'Aucune vente lissée sur 30j. Pas de suggestion.';
                urgency = 'low';
            } else {
                const coverageNeeds = dailyAverage * coverageDays;
                suggestedQuantity = Math.ceil(coverageNeeds + stats.alert_threshold - currentStock);
                reasoning = `Moyenne lissée: ${dailyAverage.toFixed(2)}/jour. Couverture ${coverageDays}j.`;

                // Déterminer urgence
                if (currentStock === 0) {
                    urgency = 'high';
                } else if (currentStock <= stats.alert_threshold / 2) {
                    urgency = 'high';
                } else if (currentStock <= stats.alert_threshold) {
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
            currentStock: currentStock, // Utilise le stock injecté
            suggestedQuantity: Math.max(0, suggestedQuantity),
            estimatedCost,
            urgency,
            reasoning
        };
    },

    /**
     * Rafraîchir les statistiques manuellement
     *
     * @note La fonction RPC refresh_product_sales_stats n'est pas incluse dans les types générés
     * car elle est créée dynamiquement via migration SQL.
     */
    async refreshStats(): Promise<void> {
        // @ts-expect-error - RPC refresh_product_sales_stats non incluse dans les types générés
        const { error } = await supabase.rpc('refresh_product_sales_stats');
        if (error) throw error;
    }
};
