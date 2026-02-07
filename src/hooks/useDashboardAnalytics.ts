import { useMemo, useEffect, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useStockManagement } from '../hooks/useStockManagement';
import { useRevenueStats } from '../hooks/useRevenueStats';
import { useTeamPerformance } from '../hooks/useTeamPerformance';
import { getCurrentBusinessDateString } from '../utils/businessDateHelpers';
import { AnalyticsService } from '../services/supabase/analytics.service';
import { useQuery } from '@tanstack/react-query';
import { Sale, SaleItem } from '../types';
import { SalesService, OfflineSale } from '../services/supabase/sales.service';
import { syncManager } from '../services/SyncManager';

interface TransitionSale extends Omit<Sale, 'id' | 'businessDate'> {
    id: string;
    businessDate: Date;
    isTransition: true;
    currency: string;
    createdBy: string;
}

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

    // 🟠 Offline Sync (Phase 10: Sprint B)
    const [offlineQueueSales, setOfflineQueueSales] = useState<OfflineSale[]>([]);

    useEffect(() => {
        // Fetch offline sales for today
        const dToday = new Date(todayDateStr);
        SalesService.getOfflineSales(currentBarId || '', dToday, dToday)
            .then(setOfflineQueueSales);

        const handleQueueUpdate = () => {
            SalesService.getOfflineSales(currentBarId || '', dToday, dToday)
                .then(setOfflineQueueSales);
        };

        const handleSyncCompleted = () => {
            console.log('[useDashboardAnalytics] Sync completed, refetching offline sales...');
            SalesService.getOfflineSales(currentBarId || '', dToday, dToday)
                .then(setOfflineQueueSales);
        };

        window.addEventListener('queue-updated', handleQueueUpdate);
        window.addEventListener('sync-completed', handleSyncCompleted);
        return () => {
            window.removeEventListener('queue-updated', handleQueueUpdate);
            window.removeEventListener('sync-completed', handleSyncCompleted);
        };
    }, [currentBarId, todayDateStr]);

    // 2. Local Computed Stats (Real-time)
    const todayValidatedSales = getTodaySales();
    const todayReturns = getTodayReturns();

    // 3. Filtered Data per Role
    const serverFilteredSales = useMemo(() => {
        const recentlySyncedMap = syncManager.getRecentlySyncedKeys();

        // 🛡️ Déduplication de la queue (Offline vs Buffer)
        const deduplicatedOfflineQueue = offlineQueueSales.filter(sale => {
            const key = sale.idempotency_key;
            return !key || !recentlySyncedMap.has(key);
        });

        // 🛡️ Transition Buffer (Phase 11.3/11.4): Bridge le gap post-sync pour la LISTE
        const transitionSales: TransitionSale[] = [];
        recentlySyncedMap.forEach((data, key) => {
            // Si la vente n'est pas encore dans la liste serveur officielle (todayValidatedSales)
            // 🛡️ UNIFICATION (V11.4): Chercher les deux casses sans cast brute
            const alreadyIndexed = todayValidatedSales.some((s: UnifiedSale) =>
                (s.idempotencyKey === key) || (s.idempotency_key === key)
            );

            if (!alreadyIndexed) {
                // On reconstruit l'objet à partir du payload sauvegardé dans le buffer (SyncManager)
                const payload = data.payload;
                if (payload) {
                    transitionSales.push({
                        id: `transition_${key}`,
                        barId: payload.bar_id,
                        total: data.total,
                        status: (payload.status || 'validated') as 'pending' | 'validated',
                        paymentMethod: payload.payment_method as any, // Enum narrowing
                        soldBy: payload.sold_by,
                        serverId: payload.server_id ?? undefined,
                        businessDate: payload.business_date ? new Date(payload.business_date) : new Date(),
                        createdAt: new Date(data.timestamp),
                        items: payload.items,
                        idempotencyKey: key,
                        isTransition: true,
                        currency: 'XAF', // Valeur par défaut ou à extraire du contexte si possible
                        createdBy: payload.sold_by // Par défaut le vendeur
                    });
                }
            }
        });

        const mergedSales = [...todayValidatedSales, ...deduplicatedOfflineQueue, ...transitionSales] as (Sale | OfflineSale | TransitionSale)[];
        if (!isServerRole) return mergedSales;
        // Source of truth: soldBy is the business attribution
        return mergedSales.filter(s => s.soldBy === currentUserId);
    }, [todayValidatedSales, offlineQueueSales, isServerRole, currentUserId]);

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

    // 🛡️ Interface d'unification pour le pool mixte (Online/Offline/Transition)
    interface UnifiedSale {
        id: string;
        status: string;
        total: number;
        idempotencyKey?: string;
        idempotency_key?: string;
        businessDate?: Date | string | null;
        business_date?: string | null;
        soldBy?: string;
        sold_by?: string;
        serverId?: string | null;
        server_id?: string | null;
        createdAt?: Date | string;
        created_at?: string;
    }

    // 4. Pending Sales (Orders Tab)
    const pendingSales = useMemo(() => {
        const isManager = !isServerRole;
        const TEN_MINUTES_MS = 10 * 60 * 1000;
        const now = new Date().getTime();

        // 🛡️ FUSION OFFLINE (Phase 15): 
        // Inclure les ventes offline en attente dans la liste des commandes
        // Le dédoublonnage est déjà fait partiellement, mais on refait une passe propre
        const allSalesPool: UnifiedSale[] = [...sales, ...offlineQueueSales.filter(os => {
            // Exclure si déjà présent dans sales via idempotencyKey
            return !sales.some(s => s.idempotencyKey === os.idempotency_key);
        })];

        return allSalesPool.filter((s: UnifiedSale) => {
            // Unification des champs snake_case vs camelCase pour le pool mixte
            const businessDateVal = s.businessDate || s.business_date;
            const saleStatus = s.status;

            const saleDateStr = businessDateVal instanceof Date
                ? businessDateVal.toISOString().split('T')[0]
                : String(businessDateVal).split('T')[0];

            // Basic filters: pending + today
            if (saleStatus !== 'pending' || saleDateStr !== todayDateStr) {
                return false;
            }

            // Managers see all
            if (isManager) {
                return true;
            }

            // Servers see only their own sales within 10 minutes
            // 🛡️ DUAL-CASING: Vérifier soldBy OU sold_by
            const sellerId = s.soldBy || s.sold_by;
            const serverId = s.serverId || s.server_id;

            const isOwnSale = sellerId === currentUserId || serverId === currentUserId;
            if (!isOwnSale) return false;

            const createdAtVal = s.createdAt || s.created_at;
            const saleTime = createdAtVal ? new Date(createdAtVal).getTime() : 0;
            const isRecent = (now - saleTime) < TEN_MINUTES_MS;
            return isRecent;
        });
    }, [sales, offlineQueueSales, todayDateStr, isServerRole, currentUserId]);

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

    const lowStockProducts = getLowStockProducts();

    const totalItems = serverFilteredSales.reduce((sum: number, sale: (Sale | OfflineSale | TransitionSale)) => {
        // 🛡️ Guard: Vérifier que items existe (ventes offline pourraient ne pas avoir items)
        if (!sale.items || !Array.isArray(sale.items)) return sum;
        return sum + sale.items.reduce((s: number, i: SaleItem) => s + (i.quantity || 0), 0);
    }, 0);

    // Top produits : agrégation locale depuis les ventes du jour (même pattern que totalItems / teamPerformance)
    const topProductsList = useMemo(() => {
        // 1. Agréger les quantités brutes par produit
        const productMap = new Map<string, { name: string; qty: number }>();

        serverFilteredSales.forEach(sale => {
            // 🛡️ Guard: Vérifier que items existe
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
