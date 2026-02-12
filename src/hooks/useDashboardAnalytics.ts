import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBarContext } from '../context/BarContext';
import { useUnifiedStock } from './pivots/useUnifiedStock';
import { useUnifiedSales } from './pivots/useUnifiedSales';
import { useUnifiedReturns } from './pivots/useUnifiedReturns';
import { useRevenueStats } from '../hooks/useRevenueStats';
import { useTeamPerformance } from '../hooks/useTeamPerformance';
import { useBarMembers } from './queries/useBarMembers';
import { getCurrentBusinessDateString } from '../utils/businessDateHelpers';
import { AnalyticsService } from '../services/supabase/analytics.service';
import { useQuery } from '@tanstack/react-query';
import type { Sale, SaleItem, Consignment } from '../types';

export function useDashboardAnalytics(currentBarId: string | undefined) {
    const { currentSession } = useAuth();
    const { currentBar } = useBarContext();

    // 🚀 Smart Hooks (Elite Mission) - Complete Migration
    const { allProductsStockInfo, consignments, products } = useUnifiedStock(currentBarId);
    const { sales: unifiedSales, stats: salesStats } = useUnifiedSales(currentBarId);
    const { getTodayReturns } = useUnifiedReturns(currentBarId, currentBar?.closingHour);

    // Bar Members for users data
    const { data: barMembers = [] } = useBarMembers(currentBarId);
    const users = useMemo(() => barMembers.map(member => ({
        ...member.user,
        role: member.role,
        isActive: member.isActive
    })), [barMembers]);

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
        enabled: !!currentBarId && !isServerRole
    });

    // 2. Local Computed Stats (Real-time)
    const todayReturns = getTodayReturns();

    // 3. Filtered Data per Role (Restricted to TODAY'S sales via salesStats.sales)
    const todaySales = salesStats.sales;

    const serverFilteredSales = useMemo(() => {
        if (!isServerRole) return todaySales;
        return (todaySales || []).filter(s => (s?.soldBy || s?.sold_by) === currentUserId);
    }, [todaySales, isServerRole, currentUserId]);

    const serverFilteredReturns = useMemo(() => {
        if (!isServerRole) return todayReturns;
        return todayReturns.filter(r => r.returnedBy === currentUserId || r.serverId === currentUserId);
    }, [todayReturns, isServerRole, currentUserId]);

    const activeConsignments = useMemo(() => consignments.filter(c => c.status === 'active'), [consignments]);
    const serverFilteredConsignments = useMemo(() => {
        if (!isServerRole) return activeConsignments;
        return (activeConsignments || []).filter(c =>
            c?.serverId === currentUserId || c?.originalSeller === currentUserId
        );
    }, [activeConsignments, isServerRole, currentUserId]);

    // 4. Pending Sales (Orders Tab)
    const pendingSales = useMemo(() => {
        const TEN_MINUTES_MS = 10 * 60 * 1000;
        const now = new Date().getTime();

        return (unifiedSales || []).filter(s => {
            if (s?.status !== 'pending') return false;

            // Managers see all
            if (!isServerRole) return true;

            // Servers see only their own recent sales
            const isOwn = (s?.soldBy || s?.sold_by) === currentUserId;
            if (!isOwn) return false;

            const time = new Date(s?.created_at || s?.createdAt).getTime();
            return (now - time) < TEN_MINUTES_MS;
        });
    }, [unifiedSales, isServerRole, currentUserId]);

    // 5. Hooks / Sub-queries
    const { netRevenue: todayTotal } = useRevenueStats({
        startDate: todayDateStr,
        endDate: todayDateStr,
        enabled: true
    });

    const teamPerformanceData = useTeamPerformance({
        sales: serverFilteredSales as Sale[],
        returns: todayReturns,
        users: users,
        barMembers: [],
        startDate: undefined,
        endDate: undefined
    });

    // Calculate low stock products from unified stock info
    const lowStockProducts = useMemo(() => {
        const threshold = (currentBar?.settings?.lowStockThreshold as number) ?? 5;
        return products
            .filter(p => {
                const info = allProductsStockInfo[p.id];
                return info && info.availableStock <= threshold;
            })
            .map(p => ({
                ...p,
                availableStock: allProductsStockInfo[p.id]?.availableStock ?? 0
            }));
    }, [products, allProductsStockInfo, currentBar?.settings?.lowStockThreshold]);

    const totalItems = useMemo(() => {
        return serverFilteredSales.reduce((sum: number, sale: any) => {
            if (!sale.items || !Array.isArray(sale.items)) return sum;
            return sum + sale.items.reduce((s: number, i: SaleItem) => s + (i.quantity || 0), 0);
        }, 0);
    }, [serverFilteredSales]);

    // Top produits
    const topProductsList = useMemo(() => {
        const productMap = new Map<string, { name: string; qty: number }>();

        serverFilteredSales.forEach((sale: any) => {
            if (!sale.items || !Array.isArray(sale.items)) return;
            sale.items.forEach((item: SaleItem) => {
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

        const todaySaleIds = new Set(serverFilteredSales.map(s => s.id));
        serverFilteredReturns.forEach(ret => {
            if (!ret.isRefunded || (ret.status !== 'approved' && ret.status !== 'restocked')) return;
            if (!todaySaleIds.has(ret.saleId)) return;
            const product = productMap.get(ret.productId);
            if (product) product.qty -= ret.quantityReturned;
        });

        return Array.from(productMap.values())
            .filter(p => p.qty > 0)
            .sort((a, b) => b.qty - a.qty)
            .slice(0, 5);
    }, [serverFilteredSales, serverFilteredReturns]);

    return {
        todayStats: dailyStats,
        sales: serverFilteredSales,
        pendingSales,
        returns: serverFilteredReturns,
        validatedReturnsCount: serverFilteredReturns.filter(r => r.status === 'approved' || r.status === 'restocked').length,
        pendingReturnsCount: serverFilteredReturns.filter(r => r.status === 'pending').length,
        consignments: serverFilteredConsignments,
        lowStockProducts,
        todayTotal: todayTotal,
        totalItems,
        teamPerformanceData,
        topProductsList,
        allProductsStockInfo,
        isServerRole,
        currentUserId,
        todayDateStr
    };
}
