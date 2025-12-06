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

        return finalFiltered.sort((a, b) => getSaleDate(b).getTime() - getSaleDate(a).getTime());
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

        // B. Appliquer les filtres de date
        let filtered = baseConsignments;
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        switch (timeRange) {
            case 'today': {
                const currentBusinessDay = getCurrentBusinessDay(closeHour);
                filtered = baseConsignments.filter(c => {
                    const consignDate = new Date(c.createdAt);
                    const consignBusinessDay = getBusinessDay(consignDate, closeHour);
                    return isSameDay(consignBusinessDay, currentBusinessDay);
                });
                break;
            }
            case 'this_week': {
                const currentDay = today.getDay();
                const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1;
                const monday = new Date();
                monday.setDate(monday.getDate() - daysFromMonday);
                monday.setHours(0, 0, 0, 0);
                const sunday = new Date(monday);
                sunday.setDate(monday.getDate() + 6);
                sunday.setHours(23, 59, 59, 999);
                filtered = baseConsignments.filter(c => {
                    const consignDate = new Date(c.createdAt);
                    return consignDate >= monday && consignDate <= sunday;
                });
                break;
            }
            case 'this_month': {
                const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
                firstDay.setHours(0, 0, 0, 0);
                const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                lastDay.setHours(23, 59, 59, 999);
                filtered = baseConsignments.filter(c => {
                    const consignDate = new Date(c.createdAt);
                    return consignDate >= firstDay && consignDate <= lastDay;
                });
                break;
            }
            case 'custom': {
                const customStartDate = new Date(customRange.start);
                customStartDate.setHours(0, 0, 0, 0);
                const customEndDate = new Date(customRange.end);
                customEndDate.setDate(customEndDate.getDate() + 1);
                filtered = baseConsignments.filter(c => {
                    const consignDate = new Date(c.createdAt);
                    return consignDate >= customStartDate && consignDate < customEndDate;
                });
                break;
            }
        }

        return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [consignments, timeRange, customRange, currentSession, closeHour]);

    return {
        ...dateFilter,
        searchTerm,
        setSearchTerm,
        filteredSales,
        filteredConsignments
    };
}
