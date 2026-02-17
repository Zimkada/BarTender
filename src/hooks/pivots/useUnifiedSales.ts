/**
 * useUnifiedSales.ts - Smart Hook (Mission Elite)
 * Unifie les ventes Online (Supabase) et Offline (IndexedDB).
 * Gère le dédoublonnage strict par idempotency_key.
 */

import { useMemo, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSales, salesKeys } from '../queries/useSalesQueries';
import { offlineQueue } from '../../services/offlineQueue';
import { syncManager } from '../../services/SyncManager';
import { useSalesMutations } from '../mutations/useSalesMutations';
import { useBarContext } from '../../context/BarContext';
import { supabase } from '../../lib/supabase';
import { getCurrentBusinessDateString, calculateBusinessDate, dateToYYYYMMDD } from '../../utils/businessDateHelpers';
import type { Sale, SaleItem } from '../../types';

/**
 * Type pour les ventes unifiées (online + offline)
 * Inclut les champs en snake_case et camelCase pour compatibilité
 */
export interface UnifiedSale extends Omit<Sale, 'createdAt' | 'validatedAt' | 'rejectedAt' | 'businessDate'> {
    created_at: string;
    business_date: string;
    idempotency_key: string;
    isOptimistic?: boolean;
    // Compatibilité pour éviter les erreurs de compilation dans les composants
    createdAt: Date | string;
    businessDate: Date | string;
    validatedAt?: Date | string;
    rejectedAt?: Date | string;
}

export interface UseUnifiedSalesOptions {
    searchTerm?: string;
    timeRange?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
    ignoreTiering?: boolean;
}

export const useUnifiedSales = (
    barId: string | undefined,
    options: UseUnifiedSalesOptions = {}
) => {
    const {
        searchTerm,
        timeRange,
        startDate,
        endDate,
        status,
        ignoreTiering = false
    } = options;
    const queryClient = useQueryClient();
    const { currentBar } = useBarContext();
    const closeHour = currentBar?.closingHour ?? 6;

    // 🔴 LOGIQUE DE TIERING (Certification Sécurité & Précision)
    const salesOptions = useMemo(() => {
        // ✨ NOUVEAU: Débrayage explicite (Certification Elite)
        if (ignoreTiering) {
            return undefined;
        }

        // ✨ NOUVEAU: Recherche "Backend-Failover"
        // Si on a un terme de recherche (min 3 caractères), on ignore les tiers
        if (searchTerm && searchTerm.length >= 3) {
            return { searchTerm };
        }

        // ✨ NOUVEAU: Débrayage via UI (Période étendue)
        // Si l'utilisateur a explicitement demandé une période au-delà du mois, on ignore le tiering par défaut
        if (timeRange && !['today', 'yesterday', 'last_7days', 'last_30days'].includes(timeRange)) {
            return undefined;
        }

        if (!currentBar?.settings?.dataTier || currentBar.settings.dataTier === 'lite') {
            return undefined;
        }

        // 🔴 CALCUL PIVOT SUR BUSINESS DATE (Fin de décalage minuit-6h)
        const businessDatePivot = calculateBusinessDate(new Date(), closeHour);

        if (currentBar.settings.dataTier === 'balanced') {
            // 6 mois glissants depuis la date commerciale
            businessDatePivot.setMonth(businessDatePivot.getMonth() - 6);
        } else if (currentBar.settings.dataTier === 'enterprise') {
            // 30 jours glissants depuis la date commerciale
            businessDatePivot.setDate(businessDatePivot.getDate() - 30);
        }

        // ✨ HYBRID FILTERING: Propagate filters to backend
        return {
            startDate: startDate || dateToYYYYMMDD(businessDatePivot),
            endDate,
            status,
            searchTerm
        };
    }, [currentBar?.settings?.dataTier, searchTerm, timeRange, closeHour, startDate, endDate, status]);

    // 1. Ventes Online (via React Query) avec options de tiering
    const { data: onlineSales = [], isLoading: isLoadingOnline } = useSales(barId, salesOptions);

    // 2. Ventes Offline (via IndexedDB)
    const { data: offlineSales = [], refetch: refetchOffline, isLoading: isLoadingOffline } = useQuery({
        queryKey: ['offline-sales-list', barId],
        networkMode: 'always',
        queryFn: async (): Promise<UnifiedSale[]> => {
            if (!barId) return [];
            const ops = await offlineQueue.getOperations({
                status: 'pending',
                barId
            });

            return ops
                .filter(op => op.type === 'CREATE_SALE')
                .map(op => {
                    const payload = op.payload;
                    const subtotal = payload.items.reduce((sum, item) => sum + item.total_price, 0);
                    const createdAt = new Date(op.timestamp).toISOString();

                    const unifiedSale: UnifiedSale = {
                        id: op.id,
                        barId: payload.bar_id,
                        items: payload.items as SaleItem[],
                        total: subtotal,
                        currency: 'XAF',
                        status: payload.status as any,
                        soldBy: payload.sold_by,
                        createdBy: payload.sold_by,
                        created_at: createdAt,
                        createdAt: createdAt, // Standardized
                        business_date: payload.business_date || createdAt.split('T')[0],
                        businessDate: payload.business_date || createdAt.split('T')[0], // Standardized
                        idempotency_key: payload.idempotency_key,
                        paymentMethod: payload.payment_method as any,
                        isOptimistic: true
                    };

                    return unifiedSale;
                });
        },
        enabled: !!barId
    });

    // 🚀 Réactivité : Écoute des événements locaux (Sync/Queue)
    useEffect(() => {
        const handleSync = (e: any) => {
            if (e.detail?.barId === barId || !e.detail?.barId) {
                refetchOffline();
                queryClient.invalidateQueries({ queryKey: salesKeys.list(barId || '') });
                queryClient.invalidateQueries({ queryKey: salesKeys.stats(barId || '') });
            }
        };

        window.addEventListener('sales-synced', handleSync);
        window.addEventListener('queue-updated', handleSync);

        return () => {
            window.removeEventListener('sales-synced', handleSync);
            window.removeEventListener('queue-updated', handleSync);
        };
    }, [barId, refetchOffline, queryClient]);



    /**
     * 🔴 Hash-Based Memoization (Mission Elite)
     * Stabilise la référence via un hash du contenu réel
     */
    const salesHash = useMemo(() => {
        return JSON.stringify({
            online: (onlineSales || []).map(s => `${s.id}-${s.status}-${s.total}`),
            offline: offlineSales.map(s => s.idempotency_key || s.id)
        });
    }, [onlineSales, offlineSales]);

    /**
     * 🔴 FUSION & DÉDOUBLONNAGE (Cœur du Smart Hook)
     */
    const unifiedSales = useMemo(() => {
        const recentlySyncedKeys = syncManager.getRecentlySyncedKeys();

        // Filtrer les ventes offline qui sont déjà arrivées sur le serveur (basé sur le tampon de 5min)
        const filteredOffline = offlineSales.filter(s => {
            if (!s.idempotency_key) return true;
            return !recentlySyncedKeys.has(s.idempotency_key);
        });

        // Fusionner et trier par date décroissante
        const combined = [...filteredOffline, ...(onlineSales || [])];

        return combined.sort((a: any, b: any) => {
            const dateA = a.created_at || a.createdAt;
            const dateB = b.created_at || b.createdAt;
            return new Date(dateB).getTime() - new Date(dateA).getTime();
        });
    }, [salesHash]); // ← Dépendance STABLE via le hash

    /**
     * 📊 STATISTIQUES CONSOLIDÉES
     */
    const stats = useMemo(() => {
        // ✨ FIX: Utiliser la date commerciale (respectant l'heure de clôture)
        // Sinon les ventes après minuit ne sont pas comptées dans "Aujourd'hui"
        const today = getCurrentBusinessDateString(currentBar?.closingHour);

        const todaySales = unifiedSales.filter((s: any) => {
            // Helper pour extraire la date YYYY-MM-DD
            const getDay = (date: any) => {
                if (!date) return '';
                if (typeof date === 'string') return date.split('T')[0];
                if (date instanceof Date) return date.toISOString().split('T')[0];
                return '';
            };

            const bDate = getDay(s.business_date || s.businessDate);
            // Comparaison sur date commerciale
            return bDate === today;
        });

        const totalRevenue = todaySales.reduce((sum, s) => sum + s.total, 0);
        const count = todaySales.length;

        return {
            todayTotal: totalRevenue,
            todayCount: count,
            sales: todaySales
        };
    }, [unifiedSales]);

    // 3. Mutations
    const salesMutations = useSalesMutations(barId || '');

    // ... (rest of the logic remains same for memoized stats)

    // Mutations Wrappers
    const addSale = useCallback(async (saleData: any) => {
        return salesMutations.createSale.mutateAsync(saleData);
    }, [salesMutations]);

    return {
        sales: unifiedSales,
        stats,
        isLoading: isLoadingOnline || isLoadingOffline,
        addSale,
        refetch: async () => {
            await syncManager.syncAll();
            refetchOffline();
            queryClient.invalidateQueries({ queryKey: salesKeys.all });
        }
    };
};
