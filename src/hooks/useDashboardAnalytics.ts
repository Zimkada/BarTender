import { useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useStockManagement } from '../hooks/useStockManagement';
import { useRevenueStats } from '../hooks/useRevenueStats';
import { useTeamPerformance } from '../hooks/useTeamPerformance';
import { getCurrentBusinessDateString } from '../utils/businessDateHelpers';
import { AnalyticsService, DailySalesSummary } from '../services/supabase/analytics.service';
import { useQuery } from '@tanstack/react-query';
import { Sale, Return } from '../types';

export function useDashboardAnalytics(currentBarId: string | undefined) {
    const { sales, getTodaySales, getTodayReturns, getLowStockProducts, users } = useAppContext();
    const { currentSession } = useAuth();
    const { consignments, allProductsStockInfo } = useStockManagement();

    // Dates
    const todayDateStr = useMemo(() => getCurrentBusinessDateString(), []);

    // Role helpers
    const isServerRole = currentSession?.role === 'serveur';
    const currentUserId = currentSession?.userId;

    // 1. Fetch Daily Summary (Global stats from DB)
    const { data: dailyStats } = useQuery({
        queryKey: ['dailySummary', currentBarId, todayDateStr],
        queryFn: async () => {
            if (!currentBarId) return null;
            const stats = await AnalyticsService.getDailySummary(currentBarId, todayDateStr, todayDateStr, 'day');
            return stats.length > 0 ? stats[0] : null;
        },
        enabled: !!currentBarId && !isServerRole // Servers don't need the heavy global aggregation often
    });

    // 2. Local Computed Stats (Real-time)
    const todayValidatedSales = getTodaySales();
    const todayReturns = getTodayReturns();

    // 3. Filtered Data per Role
    const serverFilteredSales = useMemo(() => {
        if (!isServerRole) return todayValidatedSales;
        // Source of truth: soldBy is the business attribution
        return todayValidatedSales.filter(s => s.soldBy === currentUserId);
    }, [todayValidatedSales, isServerRole, currentUserId]);

    const serverFilteredReturns = useMemo(() => {
        if (!isServerRole) return todayReturns;
        // Source of truth: returnedBy is creator, serverId is target
        return todayReturns.filter(r => r.returnedBy === currentUserId || r.serverId === currentUserId);
    }, [todayReturns, isServerRole, currentUserId]);

    const activeConsignments = consignments.filter(c => c.status === 'active');
    const serverFilteredConsignments = useMemo(() => {
        if (!isServerRole) return activeConsignments;
        return activeConsignments.filter(c =>
            c.serverId === currentUserId || c.originalSeller === currentUserId
        );
    }, [activeConsignments, isServerRole, currentUserId]);

    // 4. Pending Sales (Orders Tab)
    const pendingSales = useMemo(() => {
        const isManager = !isServerRole;
        const TEN_MINUTES_MS = 10 * 60 * 1000;
        const now = new Date().getTime();

        return sales.filter(s => {
            const saleDateStr = s.businessDate instanceof Date
                ? s.businessDate.toISOString().split('T')[0]
                : String(s.businessDate).split('T')[0];

            // Basic filters: pending + today
            if (s.status !== 'pending' || saleDateStr !== todayDateStr) {
                return false;
            }

            // Managers see all
            if (isManager) {
                return true;
            }

            // Servers see only their own sales within 10 minutes
            const isOwnSale = s.soldBy === currentUserId || s.serverId === currentUserId;
            if (!isOwnSale) return false;

            const saleTime = new Date(s.createdAt).getTime();
            const isRecent = (now - saleTime) < TEN_MINUTES_MS;
            return isRecent;
        });
    }, [sales, currentSession, todayDateStr, isServerRole, currentUserId]);

    // 5. Hooks / Sub-queries
    const { netRevenue: todayTotal } = useRevenueStats({
        startDate: todayDateStr,
        endDate: todayDateStr,
        enabled: true
    });

    const teamPerformanceData = useTeamPerformance({
        sales: isServerRole ? serverFilteredSales : todayValidatedSales,
        returns: todayReturns,
        users: users,
        barMembers: [],
        startDate: undefined,
        endDate: undefined
    });

    const lowStockProducts = getLowStockProducts();

    const totalItems = serverFilteredSales.reduce((sum: number, sale: Sale) =>
        sum + sale.items.reduce((s: number, i: any) => s + i.quantity, 0), 0
    );

    // Top produits : agrégation locale depuis les ventes du jour (même pattern que totalItems / teamPerformance)
    const topProductsList = useMemo(() => {
        // 1. Agréger les quantités brutes par produit
        const productMap = new Map<string, { name: string; qty: number }>();

        serverFilteredSales.forEach(sale => {
            sale.items.forEach(item => {
                const existing = productMap.get(item.product_id);
                if (existing) {
                    existing.qty += item.quantity;
                } else {
                    const displayName = item.product_volume
                        ? `${item.product_name} (${item.product_volume})`
                        : item.product_name;
                    productMap.set(item.product_id, { name: displayName, qty: item.quantity });
                }
            });
        });

        // 2. Déduire les retours remboursés associés aux ventes du jour
        const todaySaleIds = new Set(serverFilteredSales.map(s => s.id));

        serverFilteredReturns.forEach(ret => {
            if (!ret.isRefunded || (ret.status !== 'approved' && ret.status !== 'restocked')) return;
            if (!todaySaleIds.has(ret.saleId)) return;

            const product = productMap.get(ret.productId);
            if (product) {
                product.qty -= ret.quantityReturned;
            }
        });

        // 3. Filtrer (qty > 0), trier par quantité décroissante, limiter à 5
        return Array.from(productMap.values())
            .filter(p => p.qty > 0)
            .sort((a, b) => b.qty - a.qty)
            .slice(0, 5);
    }, [serverFilteredSales, serverFilteredReturns]);

    return {
        // Raw Data
        todayStats: dailyStats,
        sales: serverFilteredSales,
        pendingSales,
        returns: serverFilteredReturns,
        consignments: serverFilteredConsignments,
        lowStockProducts,

        // Metrics
        todayTotal: todayTotal, // 🚀 FIX: todayTotal est déjà filtré par useRevenueStats selon le rôle (serveur/gérant)
        totalItems,

        // Computed/Rich Data
        teamPerformanceData,
        topProductsList,

        // Context/Helpers
        allProductsStockInfo,
        isServerRole,
        currentUserId,
        todayDateStr
    };
}
