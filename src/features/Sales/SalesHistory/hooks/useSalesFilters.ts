import { useState, useMemo } from 'react';
import { useDateRangeFilter } from '../../../../hooks/useDateRangeFilter';
import { dateToYYYYMMDD, filterByBusinessDateRange } from '../../../../utils/businessDateHelpers';
import { getBusinessDay, getCurrentBusinessDay, isSameDay } from '../../../../utils/businessDay';
import { getSaleDate } from '../../../../utils/saleHelpers';
import { useBarContext } from '../../../../context/BarContext';
import type { Sale, SaleItem, Consignment, Return } from '../../../../types';

interface UseSalesFiltersProps {
    sales: Sale[];
    consignments: Consignment[];
    returns?: Return[]; // Optional: for returns filtering
    currentSession: any; // UserSession type would be better if available
    closeHour: number;
}

export function useSalesFilters({ sales, consignments, returns = [], currentSession, closeHour }: UseSalesFiltersProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const { currentBar } = useBarContext();

    // 1. Hook de filtrage temporel
    const dateFilter = useDateRangeFilter({
        defaultRange: 'today',
        includeBusinessDay: true,
        closeHour
    });

    const { startDate, endDate, timeRange, customRange } = dateFilter;

    // 2. Filtrage des ventes
    const filteredSales = useMemo(() => {
        const isServer = currentSession?.role === 'serveur';
        const operatingMode = currentBar?.settings?.operatingMode || 'full';

        // A. Filtrage initial basé sur le rôle et le mode opérationnel
        const baseSales = sales.filter(sale => {
            if (isServer) {
                // ✨ MODE SWITCHING FIX: A server should see ALL their sales regardless of mode
                // Check BOTH serverId (simplified mode) AND soldBy (full mode)
                // This ensures data visibility persists across mode switches
                // ✅ REVENUE FIX: Only count validated sales for revenue calculations
                return sale.status === 'validated' && (sale.serverId === currentSession.userId || sale.soldBy === currentSession.userId);
            } else {
                // Gérant/Promoteur/Admin: voir uniquement les ventes validées
                return sale.status === 'validated';
            }
        });

        // B. Appliquer le filtre de date
        const startDateStr = dateToYYYYMMDD(startDate);
        const endDateStr = dateToYYYYMMDD(endDate);
        const filtered = filterByBusinessDateRange(baseSales, startDateStr, endDateStr, closeHour);

        // C. Filtre par recherche
        let finalFiltered = filtered;
        if (searchTerm) {
            finalFiltered = filtered.filter(sale =>
                sale.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                sale.items.some((item: SaleItem) => {
                    const name = item.product_name;
                    return name.toLowerCase().includes(searchTerm.toLowerCase());
                })
            );
        }

        // D. Tri final par date de transaction réelle (plus récent en premier)
        return finalFiltered.sort((a, b) => {
            const dateA = new Date(a.validatedAt || a.createdAt);
            const dateB = new Date(b.validatedAt || b.createdAt);
            return dateB.getTime() - dateA.getTime();
        });
    }, [sales, startDate, endDate, searchTerm, currentSession, closeHour, currentBar?.settings?.operatingMode]);

    // 3. Filtrage des consignations
    const filteredConsignments = useMemo(() => {
        const isServer = currentSession?.role === 'serveur';
        const operatingMode = currentBar?.settings?.operatingMode || 'full';

        // A. Filtrage initial basé sur le rôle et le mode opérationnel
        const baseConsignments = consignments.filter(consignment => {
            if (isServer) {
                // ✨ MODE SWITCHING FIX: A server should see ALL their consignments regardless of mode
                // Check BOTH serverId (simplified mode) AND originalSeller (full mode)
                // This ensures data visibility persists across mode switches
                return consignment.serverId === currentSession.userId || consignment.originalSeller === currentSession.userId;
            }
            return true;
        });

        // B. Appliquer le filtre de date (logique business day unifiée)
        const startDateStr = dateToYYYYMMDD(startDate);
        const endDateStr = dateToYYYYMMDD(endDate);
        const filtered = filterByBusinessDateRange(baseConsignments, startDateStr, endDateStr, closeHour);

        // C. Tri final
        return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [consignments, startDate, endDate, currentSession, closeHour, currentBar?.settings?.operatingMode]);

    // 4. Filtrage des retours
    const filteredReturns = useMemo(() => {
        const isServer = currentSession?.role === 'serveur';
        const operatingMode = currentBar?.settings?.operatingMode || 'full';

        // A. Filtrage initial basé sur le rôle et le mode opérationnel
        const baseReturns = returns.filter(returnItem => {
            if (isServer) {
                // ✨ MODE SWITCHING FIX: A server should see ALL their returns regardless of mode
                // Check BOTH server_id (simplified mode) AND returnedBy (full mode)
                // This ensures data visibility persists across mode switches
                return returnItem.server_id === currentSession.userId || returnItem.returnedBy === currentSession.userId;
            }
            return true; // Gérant/Admin: voir tous les retours
        });

        // B. Appliquer le filtre de date
        const startDateStr = dateToYYYYMMDD(startDate);
        const endDateStr = dateToYYYYMMDD(endDate);
        const filtered = filterByBusinessDateRange(baseReturns, startDateStr, endDateStr, closeHour);

        // C. Tri final
        return filtered.sort((a, b) => new Date(b.returnedAt).getTime() - new Date(a.returnedAt).getTime());
    }, [returns, startDate, endDate, currentSession, closeHour, currentBar?.settings?.operatingMode]);

    return {
        ...dateFilter,
        searchTerm,
        setSearchTerm,
        filteredSales,
        filteredConsignments,
        filteredReturns
    };
}
