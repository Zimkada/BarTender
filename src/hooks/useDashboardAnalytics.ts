import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBarContext } from '../context/BarContext';
import { useUnifiedStock } from './pivots/useUnifiedStock';
import { useUnifiedSales } from './pivots/useUnifiedSales';
import { useUnifiedReturns } from './pivots/useUnifiedReturns';
import { useTeamPerformance } from '../hooks/useTeamPerformance';
import { useBarMembers } from './queries/useBarMembers';
import { useTopProducts } from './queries/useTopProductsQuery';
import { getCurrentBusinessDateString } from '../utils/businessDateHelpers';
import type { Sale, SaleItem } from '../types';


export function useDashboardAnalytics(currentBarId: string | undefined) {
    const { currentSession } = useAuth();
    const { currentBar } = useBarContext();

    // 🚀 Smart Hooks (Elite Mission) - Complete Migration
    const { allProductsStockInfo, consignments, products } = useUnifiedStock(currentBarId, { skipSupplies: true });

    // 🛡️ Expert Fix: Force TODAY filter to avoid loading lifetime sales history
    const todayStr = useMemo(() => getCurrentBusinessDateString(currentBar?.closingHour), [currentBar?.closingHour]);
    const { sales: unifiedSales } = useUnifiedSales(currentBarId, {
        startDate: todayStr,
        endDate: todayStr,
        includeItems: false,
    });
    const { sales: pendingSalesDetailed } = useUnifiedSales(currentBarId, {
        startDate: todayStr,
        endDate: todayStr,
        status: 'pending',
        includeItems: true,
    });

    const { getTodayReturns } = useUnifiedReturns(currentBarId, currentBar?.closingHour);

    // Bar Members for users data
    const { data: barMembers = [] } = useBarMembers(currentBarId);
    const users = useMemo(() => barMembers.map(member => ({
        ...member.user,
        role: member.role,
        isActive: member.isActive
    })), [barMembers]);

    // Dates
    const todayDateStr = useMemo(() => getCurrentBusinessDateString(currentBar?.closingHour), [currentBar?.closingHour]);

    // Role helpers
    const isServerRole = currentSession?.role === 'serveur';
    const currentUserId = currentSession?.userId;
    const { data: topProductsServer = [] } = useTopProducts({
        barId: currentBarId || '',
        startDate: todayStr,
        endDate: todayStr,
        limit: 10,
        sortBy: 'quantity',
        serverId: isServerRole ? currentUserId : undefined,
        enabled: !!currentBarId,
    });


    // 2. Local Computed Stats (Real-time)
    const todayReturns = getTodayReturns();

    // 3. Filtered Data per Role (Restricted to TODAY'S sales via salesStats.sales)
    const todaySales = useMemo(() => {
        return unifiedSales.filter((s: any) => {
            // Helper pour extraire la date YYYY-MM-DD
            const getDay = (date: any) => {
                if (!date) return '';
                if (typeof date === 'string') return date.split('T')[0];
                if (date instanceof Date) return date.toISOString().split('T')[0];
                return '';
            };

            const bDate = getDay(s.business_date || s.businessDate);
            // 🛡️ FIX P1: Comparer avec la date COMMERCIALE (todayDateStr) et non calendaire
            return bDate === todayDateStr;
        });
    }, [unifiedSales, todayDateStr]);

    const serverFilteredSales = useMemo(() => {
        if (!isServerRole) return todaySales;
        return (todaySales || []).filter(s => s.soldBy === currentUserId);
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

        return (pendingSalesDetailed || []).filter(s => {
            if (s?.status !== 'pending') return false;

            // Managers see all
            if (!isServerRole) return true;

            // Servers see only their own recent sales
            const isOwn = s.soldBy === currentUserId;
            if (!isOwn) return false;

            const time = new Date(s.createdAt).getTime();
            return (now - time) < TEN_MINUTES_MS;
        });
    }, [pendingSalesDetailed, isServerRole, currentUserId]);

    // 5. Revenue: calculé localement depuis les données déjà chargées (évite duplication pivot hooks via useRevenueStats)
    const todayTotal = useMemo(() => {
        const grossRevenue = serverFilteredSales
            .filter((s: any) => s.status === 'validated')
            .reduce((sum: number, s: any) => sum + (s.total || 0), 0);
        const refundsTotal = serverFilteredReturns
            .filter(r => r.status === 'approved' || r.status === 'restocked')
            .reduce((sum, r) => sum + (r.refundAmount || 0), 0);
        return grossRevenue - refundsTotal;
    }, [serverFilteredSales, serverFilteredReturns]);

    const teamPerformanceData = useTeamPerformance({
        sales: serverFilteredSales as Sale[],
        returns: todayReturns,
        users: users,
        barMembers: barMembers,
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
            if (typeof sale.items_count === 'number') return sum + sale.items_count;
            if (!sale.items || !Array.isArray(sale.items)) return sum;
            return sum + sale.items.reduce((s: number, i: SaleItem) => s + (i.quantity || 0), 0);
        }, 0);
    }, [serverFilteredSales]);

    const topProductsList = useMemo(() => {
        return topProductsServer
            .map((product) => ({
                name: product.product_volume
                    ? `${product.product_name} (${product.product_volume})`
                    : product.product_name,
                qty: product.total_quantity,
            }))
            .filter((product) => product.qty > 0)
            .sort((a, b) => b.qty - a.qty)
            .slice(0, 5);
    }, [topProductsServer]);

    return {
        todayStats: null, // Redondant avec todayTotal, supprimé pour unification
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

