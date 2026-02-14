import { useState, useMemo } from 'react';
import { dateToYYYYMMDD, filterByBusinessDateRange } from '../../../../utils/businessDateHelpers';
import type { Sale, SaleItem, Return } from '../../../../types';
import { UnifiedReturn } from '../../../../hooks/pivots/useUnifiedReturns';

interface UseSalesFiltersProps {
    sales: Sale[];
    returns?: (Return | UnifiedReturn)[];
    currentSession: any;
    closeHour: number;
    statusFilter?: 'validated' | 'rejected' | 'cancelled' | 'all';
    // ✨ NOUVEAU: Contrôle externe
    externalStartDate: Date;
    externalEndDate: Date;
}

export function useSalesFilters({
    sales,
    returns = [],
    currentSession,
    closeHour,
    statusFilter,
    externalStartDate,
    externalEndDate
}: UseSalesFiltersProps) {
    const [searchTerm, setSearchTerm] = useState('');

    // 2. Filtrage des ventes
    const filteredSales = useMemo(() => {
        const isServer = currentSession?.role === 'serveur';

        // A. Filtrage initial basé sur le rôle et le statut actif
        const activeStatus = statusFilter === 'all' ? undefined : (statusFilter || 'validated');

        const baseSales = sales.filter(sale => {
            if (isServer) {
                return sale.status === 'validated' && sale.soldBy === currentSession.userId;
            } else {
                return activeStatus ? sale.status === activeStatus : true;
            }
        });

        // B. Appliquer le filtre de date
        const startDateStr = dateToYYYYMMDD(externalStartDate);
        const endDateStr = dateToYYYYMMDD(externalEndDate);
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
                        (s.status === 'rejected' && s.rejectedAt) ? s.rejectedAt :
                            s.validatedAt || s.createdAt
                );
            return getDate(b).getTime() - getDate(a).getTime();
        });
    }, [sales, externalStartDate, externalEndDate, searchTerm, currentSession, closeHour, statusFilter]);

    // 3. Filtrage des retours
    const filteredReturns = useMemo(() => {
        const isServer = currentSession?.role === 'serveur';

        // A. Filtrage initial basé sur le rôle et le mode opérationnel
        const baseReturns = returns.filter(returnItem => {
            if (isServer) {
                return returnItem.server_id === currentSession.userId || returnItem.returnedBy === currentSession.userId;
            }
            return true;
        });

        // B. Appliquer le filtre de date
        const startDateStr = dateToYYYYMMDD(externalStartDate);
        const endDateStr = dateToYYYYMMDD(externalEndDate);

        const filtered = filterByBusinessDateRange(baseReturns, startDateStr, endDateStr, closeHour);

        // C. Tri final : Priorité au statut 'pending', puis date décroissante
        return filtered.sort((a, b) => {
            if (a.status === 'pending' && b.status !== 'pending') return -1;
            if (a.status !== 'pending' && b.status === 'pending') return 1;

            const dateA = new Date((a as any).returnedAt || (a as any).returned_at).getTime();
            const dateB = new Date((b as any).returnedAt || (b as any).returned_at).getTime();
            return dateB - dateA;
        });
    }, [returns, externalStartDate, externalEndDate, currentSession, closeHour]);

    return {
        searchTerm,
        setSearchTerm,
        filteredSales,
        filteredReturns
    };
}
