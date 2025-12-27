
import { useState, useMemo, useEffect } from 'react';
import { AnalyticsService, TopProduct } from '../../../../services/supabase/analytics.service';
import { ProxyAdminService } from '../../../../services/supabase/proxy-admin.service';
import { useActingAs } from '../../../../context/ActingAsContext';
import type { Sale, Return, Bar } from '../../../../types';

interface UseSalesStatsProps {
    filteredSales: Sale[];
    returns: Return[];
    timeRange: string;
    startDate: Date;
    endDate: Date;
    currentBar: Bar | null;
    serverId?: string; // Optional: for filtering top products by server
}

export function useSalesStats({
    filteredSales,
    returns,
    timeRange,
    startDate,
    endDate,
    currentBar,
    serverId
}: UseSalesStatsProps) {
    // --- CONTEXTE ---
    const { actingAs } = useActingAs();

    // --- ÉTATS ---
    const [topProductsLimit, setTopProductsLimit] = useState<number>(5);
    const [topProductMetric, setTopProductMetric] = useState<'units' | 'revenue' | 'profit'>('units');
    const [sqlTopProducts, setSqlTopProducts] = useState<TopProduct[]>([]);
    const [isLoadingTopProducts, setIsLoadingTopProducts] = useState(false);

    // --- EFFETS ---
    // Load top products from SQL view when filters change
    useEffect(() => {
        if (!currentBar) return;

        const loadTopProducts = async () => {
            setIsLoadingTopProducts(true);
            try {
                let products;

                // LOGIQUE HYBRIDE: Proxy vs Standard
                if (actingAs.isActive && actingAs.userId && actingAs.barId === currentBar.id) {
                    // MODE PROXY
                    const proxyData = await ProxyAdminService.getTopProductsAsProxy(
                        actingAs.userId,
                        currentBar.id,
                        startDate,
                        endDate,
                        topProductsLimit
                    );

                    // Mapper le résultat RPC (déjà snake_case ou camelCase selon le retour RPC)
                    // Le RPC retourne: product_name, product_volume, total_quantity, total_revenue, avg_unit_price
                    // On doit mapper vers TopProduct interface
                    products = proxyData.map((p: any) => ({
                        product_id: 'proxy', // Placeholder
                        product_name: p.product_name,
                        product_volume: p.product_volume,
                        total_quantity: p.total_quantity,
                        total_revenue: p.total_revenue,
                        avg_unit_price: p.avg_unit_price,
                        // Champs optionnels ou calculés
                        bar_id: currentBar.id,
                        sale_date: '',
                        sale_week: '',
                        sale_month: '',
                        transaction_count: 0
                    }));

                } else {
                    // MODE STANDARD (with optional server filtering)
                    products = await AnalyticsService.getTopProducts(
                        currentBar.id,
                        startDate,
                        endDate,
                        topProductsLimit,
                        'quantity', // Default sort by quantity
                        serverId // Optional: filter by server_id for server accounts
                    );
                }

                setSqlTopProducts(products || []);
            } catch (error) {
                console.error('Error loading top products:', error);
                setSqlTopProducts([]);
            } finally {
                setIsLoadingTopProducts(false);
            }
        };

        loadTopProducts();
    }, [currentBar, startDate, endDate, topProductsLimit, actingAs.isActive, actingAs.userId, actingAs.barId, serverId]);

    // --- CALCULS ---
    const stats = useMemo(() => {
        // 1. Total des ventes brutes
        const grossRevenue = filteredSales.reduce((sum, sale) => sum + sale.total, 0);

        // 2. Déduire les retours remboursés des ventes affichées
        const saleIds = new Set(filteredSales.map(s => s.id));
        const refundedReturns = returns
            .filter(r =>
                saleIds.has(r.saleId) &&
                r.isRefunded &&
                (r.status === 'approved' || r.status === 'restocked')
            )
            .reduce((sum, r) => sum + r.refundAmount, 0);

        // 3. CA NET = Ventes brutes - Retours remboursés
        const totalRevenue = grossRevenue - refundedReturns;

        // 4. Nombre total d'articles
        const totalItems = filteredSales.reduce((sum, sale) =>
            sum + sale.items.reduce((sum, item) => sum + item.quantity, 0), 0
        );

        // 5. KPI contextuel selon la période
        let kpiValue = 0;
        let kpiLabel = 'Panier moyen';

        // Calculer le nombre de jours dans la période sélectionnée
        const dayCount = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));

        if (timeRange === 'today') {
            const now = new Date();
            // Assurer que "now" ne soit pas avant le début de la journée commerciale
            const effectiveNow = now < startDate ? startDate : now;
            const hoursElapsed = (effectiveNow.getTime() - startDate.getTime()) / (1000 * 60 * 60);
            kpiValue = hoursElapsed > 0 ? totalRevenue / hoursElapsed : 0;
            kpiLabel = 'CA moyen/heure';
        } else {
            kpiValue = totalRevenue / dayCount;
            kpiLabel = 'CA moyen/jour';
        }

        // 6. Top Produits (transformé depuis SQL)
        // ✨ NOUVEAU: Utiliser profit calculé par la RPC (revenue - quantity × CUMP)
        const topProductsResult = (sqlTopProducts && sqlTopProducts.length > 0)
            ? sqlTopProducts.map(p => ({
                name: p.product_name,
                volume: p.product_volume || '',
                displayName: `${p.product_name}${p.product_volume ? ' (' + p.product_volume + ')' : ''}`,
                units: p.total_quantity,
                revenue: p.total_revenue,
                profit: p.profit ?? p.total_revenue // Use calculated profit from RPC, fallback to revenue if not available
            }))
            : [];

        // Créer les 3 listes triées
        // Note: Elles sont déjà filtrées par la requête SQL limit, mais on re-slice pour la sécurité
        const byUnits = [...topProductsResult].sort((a, b) => b.units - a.units).slice(0, topProductsLimit);
        const byRevenue = [...topProductsResult].sort((a, b) => b.revenue - a.revenue).slice(0, topProductsLimit);
        const byProfit = [...topProductsResult].sort((a, b) => b.profit - a.profit).slice(0, topProductsLimit);

        return {
            totalRevenue,
            totalItems,
            kpiValue,
            kpiLabel,
            topProducts: { byUnits, byRevenue, byProfit }
        };
    }, [filteredSales, returns, timeRange, sqlTopProducts, topProductsLimit, startDate, endDate]);

    return {
        stats,
        topProductsLimit,
        setTopProductsLimit,
        topProductMetric,
        setTopProductMetric,
        sqlTopProducts,
        setSqlTopProducts, // Exported in case it's needed elsewhere, though mainly internal
        isLoadingTopProducts
    };
}
