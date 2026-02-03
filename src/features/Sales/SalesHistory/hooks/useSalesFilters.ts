import { useState, useMemo } from 'react';
import { useDateRangeFilter } from '../../../../hooks/useDateRangeFilter';
import { dateToYYYYMMDD, filterByBusinessDateRange } from '../../../../utils/businessDateHelpers';
import type { Sale, SaleItem, Return } from '../../../../types';

interface UseSalesFiltersProps {
    sales: Sale[];
    returns?: Return[]; // Optional: for returns filtering
    currentSession: any; // UserSession type would be better if available
    closeHour: number;
    statusFilter?: 'validated' | 'rejected' | 'cancelled';
}

export function useSalesFilters({ sales, returns = [], currentSession, closeHour, statusFilter }: UseSalesFiltersProps) {
    const [searchTerm, setSearchTerm] = useState('');

    // 1. Hook de filtrage temporel
    const dateFilter = useDateRangeFilter({
        defaultRange: 'today',
        includeBusinessDay: true,
        closeHour
    });

    const { startDate, endDate } = dateFilter;

    // 2. Filtrage des ventes
    const filteredSales = useMemo(() => {
        const isServer = currentSession?.role === 'serveur';

        // A. Filtrage initial basé sur le rôle et le statut actif
        const activeStatus = statusFilter || 'validated';
        const baseSales = sales.filter(sale => {
            if (isServer) {
                // Serveurs : toujours leurs propres ventes validées (pills non visibles pour eux)
                return sale.status === 'validated' && sale.soldBy === currentSession.userId;
            } else {
                // Gérant/Promoteur/Admin: filtrer par le statut sélectionné via les pills
                return sale.status === activeStatus;
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

        // D. Tri final par date pertinente selon le statut (plus récent en premier)
        return finalFiltered.sort((a, b) => {
            const getDate = (s: Sale) =>
                new Date(
                    (s.status === 'cancelled' && s.cancelledAt) ? s.cancelledAt :
                    (s.status === 'rejected'  && s.rejectedAt)  ? s.rejectedAt  :
                    s.validatedAt || s.createdAt
                );
            return getDate(b).getTime() - getDate(a).getTime();
        });
    }, [sales, startDate, endDate, searchTerm, currentSession, closeHour, statusFilter]);

    // 3. Filtrage des retours
    const filteredReturns = useMemo(() => {
        const isServer = currentSession?.role === 'serveur';

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
    }, [returns, startDate, endDate, currentSession, closeHour]);

    return {
        ...dateFilter,
        searchTerm,
        setSearchTerm,
        filteredSales,
        filteredReturns
    };
}
