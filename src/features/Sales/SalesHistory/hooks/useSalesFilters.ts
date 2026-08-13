import { useState, useMemo } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { dateToYYYYMMDD, filterByBusinessDateRange } from '../../../../utils/businessDateHelpers';
import type { Sale, SaleItem, Return, UserSession } from '../../../../types';
import { UnifiedReturn } from '../../../../hooks/pivots/useUnifiedReturns';
import type { UnifiedSale } from '../../../../hooks/pivots/useUnifiedSales';

interface UseSalesFiltersProps {
    sales: Array<Sale | UnifiedSale>;
    returns?: (Return | UnifiedReturn)[];
    currentSession: UserSession | null;
    closeHour: number;
    statusFilter?: 'validated' | 'rejected' | 'cancelled' | 'all';
    searchTerm?: string;
    setSearchTerm?: (value: string) => void;
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
    searchTerm: controlledSearchTerm,
    setSearchTerm: controlledSetSearchTerm,
    externalStartDate,
    externalEndDate
}: UseSalesFiltersProps) {
    const [internalSearchTerm, setInternalSearchTerm] = useState('');
    const searchTerm = controlledSearchTerm ?? internalSearchTerm;
    const setSearchTerm = controlledSetSearchTerm ?? setInternalSearchTerm;

    // 🛡️ Périmètre de lecture piloté par PERMISSION, jamais par rôle brut
    // (cf. MATRICE_RBAC_CUISINIER §6). `currentSession` reste une prop : elle sert
    // à identifier l'utilisateur (userId), pas à décider de ses droits.
    const { hasPermission } = useAuth();
    const canViewAllSales = hasPermission('canViewAllSales');

    // 2. Filtrage des ventes
    const filteredSales = useMemo(() => {
        // ⚠️ userId extrait ici : l'ancien test `currentSession?.role === ...` assurait
        // aussi le narrowing TypeScript, que canViewAllSales ne fait pas.
        const currentUserId = currentSession?.userId;
        const isServer = !canViewAllSales && !!currentUserId;

        // A. Filtrage initial basé sur le rôle et le statut actif
        const activeStatus = statusFilter === 'all' ? undefined : (statusFilter || 'validated');

        const baseSales = sales.filter(sale => {
            if (isServer) {
                return sale.status === 'validated' && sale.soldBy === currentUserId;
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
    }, [sales, externalStartDate, externalEndDate, searchTerm, currentSession, closeHour, statusFilter, canViewAllSales]);

    // 3. Filtrage des retours
    const filteredReturns = useMemo(() => {
        // ⚠️ Même raison qu'au-dessus : extraire userId pour conserver le narrowing.
        const currentUserId = currentSession?.userId;
        const isServer = !canViewAllSales && !!currentUserId;

        // A. Filtrage initial basé sur le rôle et le mode opérationnel
        const baseReturns = returns.filter(returnItem => {
            if (isServer) {
                return returnItem.server_id === currentUserId || returnItem.returnedBy === currentUserId;
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

            const dateA = new Date(String(('returned_at' in a ? a.returned_at : undefined) || a.returnedAt)).getTime();
            const dateB = new Date(String(('returned_at' in b ? b.returned_at : undefined) || b.returnedAt)).getTime();
            return dateB - dateA;
        });
    }, [returns, externalStartDate, externalEndDate, currentSession, closeHour, canViewAllSales]);

    return {
        searchTerm,
        setSearchTerm,
        filteredSales,
        filteredReturns
    };
}
