import { useState, useMemo, useEffect } from 'react';
import { AnalyticsService, TopProduct } from '../../../../services/supabase/analytics.service';
import type { Sale, Bar } from '../../../../types';

interface UseSalesStatsProps {
    filteredSales: Sale[];
    timeRange: string;
    startDate: Date;
    endDate: Date;
    currentBar: Bar | null;
    serverId?: string; // Optional: for filtering top products by server
}

export function useSalesStats({
    filteredSales,
    timeRange,
    startDate,
    endDate,
    currentBar,
    serverId
}: UseSalesStatsProps) {
    // --- ÉTATS ---
    const [topProductsLimit, setTopProductsLimit] = useState<number>(5);
    const [topProductMetric, setTopProductMetric] = useState<'units' | 'revenue' | 'profit'>('units');
    const [sqlTopProducts, setSqlTopProducts] = useState<TopProduct[]>([]);
    const [backendRevenue, setBackendRevenue] = useState<{ totalRevenue: number; totalItems: number } | null>(null);
    const [isLoadingStats, setIsLoadingStats] = useState(false);

    // --- EFFETS ---
    // Load statistics from SQL view and RPC when filters change
    useEffect(() => {
        if (!currentBar) return;

        const loadStats = async () => {
            setIsLoadingStats(true);
            try {
                // 1. Charger le CA exact via le backend (Source de vérité)
                const revSummary = await AnalyticsService.getRevenueSummary(
                    currentBar.id,
                    startDate,
                    endDate
                );

                // 2. Charger les top produits via RPC
                const products = await AnalyticsService.getTopProducts(
                    currentBar.id,
                    startDate,
                    endDate,
                    topProductsLimit,
                    'quantity',
                    serverId
                );

                setBackendRevenue({
                    totalRevenue: revSummary.totalRevenue,
                    totalItems: revSummary.totalSales // On utilise le nombre de ventes validées comme proxy totalItems si nécessaire, ou on enrichit getRevenueSummary
                });
                setSqlTopProducts(products || []);
            } catch (error) {
                console.error('Error loading stats:', error);
                setSqlTopProducts([]);
            } finally {
                setIsLoadingStats(false);
            }
        };

        loadStats();
    }, [
        currentBar?.id,
        startDate.toISOString(),
        endDate.toISOString(),
        topProductsLimit,
        serverId
    ]);


    // --- CALCULS ---
    const stats = useMemo(() => {
        // 🔴 CERTIFICATION SÉCURITÉ : FUSION BACKEND + OFFLINE
        // Le backend contient les ventes validées. 
        // L'offline contient les ventes pas encore synchronisées.

        const offlineAmount = filteredSales
            .filter(s => (s as any).isOptimistic)
            .reduce((sum, s) => sum + s.total, 0);

        const offlineCount = filteredSales
            .filter(s => (s as any).isOptimistic).length;

        // 1. Total des revenus (Backend + Offline en attente)
        const totalRevenue = (backendRevenue?.totalRevenue || 0) + offlineAmount;

        // 2. Nombre total d'articles (Simplifié : Nombre de transactions pour le moment ou calcul exact)
        // Note: Pour une précision totale sur les items, le backend summary devrait inclure total_items_sold
        const totalItems = (backendRevenue?.totalItems || 0) + offlineCount;

        // 3. KPI contextuel selon la période
        let kpiValue = 0;
        let kpiLabel = 'Panier moyen';

        // Calculer le nombre de jours dans la période sélectionnée
        const dayCount = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));

        if (timeRange === 'today') {
            const now = new Date();
            const effectiveNow = now < startDate ? startDate : now;
            const hoursElapsed = (effectiveNow.getTime() - startDate.getTime()) / (1000 * 60 * 60);
            kpiValue = hoursElapsed > 0 ? totalRevenue / hoursElapsed : 0;
            kpiLabel = 'CA moyen/heure';
        } else {
            kpiValue = totalRevenue / dayCount;
            kpiLabel = 'CA moyen/jour';
        }

        // 4. Top Produits (transformé depuis SQL)
        const topProductsResult = (sqlTopProducts && sqlTopProducts.length > 0)
            ? sqlTopProducts.map(p => ({
                name: p.product_name,
                volume: p.product_volume || '',
                displayName: `${p.product_name}${p.product_volume ? ' (' + p.product_volume + ')' : ''}`,
                units: p.total_quantity,
                revenue: p.total_revenue,
                profit: p.profit ?? p.total_revenue
            }))
            : [];

        // Créer les 3 listes triées
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
    }, [filteredSales, backendRevenue, timeRange, sqlTopProducts, topProductsLimit, startDate, endDate]);

    return {
        stats,
        topProductsLimit,
        setTopProductsLimit,
        topProductMetric,
        setTopProductMetric,
        sqlTopProducts,
        setSqlTopProducts, // Exported in case it's needed elsewhere, though mainly internal
        isLoadingStats
    };
}
