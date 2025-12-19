import { useState, useMemo } from 'react';
import { useDateRangeFilter } from '../../../../hooks/useDateRangeFilter';
import { dateToYYYYMMDD, filterByBusinessDateRange } from '../../../../utils/businessDateHelpers';
import { getBusinessDay, getCurrentBusinessDay, isSameDay } from '../../../../utils/businessDay';
import { getSaleDate } from '../../../../utils/saleHelpers';
import type { Sale, SaleItem, Consignment } from '../../../../types';

interface UseSalesFiltersProps {
    sales: Sale[];
    consignments: Consignment[];
    currentSession: any; // UserSession type would be better if available
    closeHour: number;
}

export function useSalesFilters({ sales, consignments, currentSession, closeHour }: UseSalesFiltersProps) {
    const [searchTerm, setSearchTerm] = useState('');

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

        // A. Filtrage initial basé sur le rôle
        const baseSales = sales.filter(sale => {
            if (isServer) {
                return sale.createdBy === currentSession.userId;
            } else {
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
    }, [sales, startDate, endDate, searchTerm, currentSession, closeHour]);

    // 3. Filtrage des consignations
    const filteredConsignments = useMemo(() => {
        const isServer = currentSession?.role === 'serveur';

        // A. Filtrage initial basé sur le rôle
        const baseConsignments = consignments.filter(consignment => {
            if (isServer) {
                return consignment.originalSeller === currentSession.userId;
            }
            return true;
        });

        // B. Appliquer le filtre de date (logique business day unifiée)
        const startDateStr = dateToYYYYMMDD(startDate);
        const endDateStr = dateToYYYYMMDD(endDate);
        const filtered = filterByBusinessDateRange(baseConsignments, startDateStr, endDateStr, closeHour);

        // C. Tri final
        return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [consignments, startDate, endDate, currentSession, closeHour]);

    return {
        ...dateFilter,
        searchTerm,
        setSearchTerm,
        filteredSales,
        filteredConsignments
    };
}
