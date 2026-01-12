import { useMemo } from 'react';
import { Sale, Return, User, BarMember } from '../types';
import { dateToYYYYMMDD, getBusinessDate } from '../utils/businessDateHelpers';

export type UserPerformanceStat = {
    userId: string;
    name: string;
    role: string;
    revenue: number;
    sales: number;
    items: number;
};

interface UseTeamPerformanceProps {
    sales: Sale[];
    returns: Return[];
    users: User[];
    barMembers: BarMember[];
    startDate?: Date;
    endDate?: Date;
    closeHour?: number;
}

export function useTeamPerformance({
    sales,
    returns,
    users,
    barMembers,
    startDate,
    endDate,
    closeHour = 4 // Default close hour if not provided
}: UseTeamPerformanceProps) {

    const safeUsers = users || [];
    const safeBarMembers = barMembers || [];

    return useMemo(() => {
        const userStats: Record<string, UserPerformanceStat> = {};

        // 1. Ajouter les ventes
        // On suppose que les ventes passées en props sont DÉJÀ filtrées pour la période souhaitée
        // (C'est le cas dans AnalyticsView via useDateRangeFilter et DailyDashboard via getTodaySales)

        sales.forEach(sale => {
            // Source of truth: soldBy is the business attribution
            const serverId = sale.soldBy;

            // Trouver l'utilisateur correspondant
            const user = safeUsers.find(u => u.id === serverId);

            // Chercher d'abord dans barMembers, sinon utiliser le rôle de l'utilisateur
            const member = safeBarMembers.find(m => m.userId === serverId);
            const role = member?.role || (user?.role) || 'serveur';

            // Identité
            const userId = serverId;
            const userName = user?.name || sale.assignedTo || 'Ancien membre';

            if (!userStats[userId]) {
                userStats[userId] = {
                    userId,
                    name: userName,
                    role,
                    revenue: 0,
                    sales: 0,
                    items: 0
                };
            }

            userStats[userId].revenue += sale.total;
            userStats[userId].sales += 1;
            userStats[userId].items += sale.items.reduce((sum, item) => sum + item.quantity, 0);
        });

        // 2. Déduire les retours remboursés
        // Pour les retours, on doit faire attention si on nous passe TOUS les retours ou juste ceux de la période.
        // Dans le doute, si startDate/endDate sont fournis, on refiltre par sécurité.
        // Sinon on assume que 'returns' est déjà filtré.

        let relevantReturns = returns;

        if (startDate && endDate) {
            const startDateStr = dateToYYYYMMDD(startDate);
            const endDateStr = dateToYYYYMMDD(endDate);
            const performanceSaleIds = new Set(sales.map(s => s.id));

            relevantReturns = returns.filter(r => {
                if (r.status !== 'approved' && r.status !== 'restocked') return false;
                if (!r.isRefunded) return false;

                // 🔒 IMPORTANT: Seulement retours des ventes affichées (si on veut être strict sur la période d'analyse)
                // OU si on veut tous les retours REMBOURSÉS durant cette période (indépendamment de quand la vente a eu lieu) ?
                // La logique actuelle d'AnalyticsView est : "Seulement retours des ventes affichées".
                // On garde cette logique pour la cohérence.
                if (!performanceSaleIds.has(r.saleId)) return false;

                // Filtrer par business_date du retour
                const returnBusinessDate = getBusinessDate(r, closeHour);
                return returnBusinessDate >= startDateStr && returnBusinessDate <= endDateStr;
            });
        } else {
            // Mode "DailyDashboard" (pas de date range explicite, on assume les retours du jour)
            // On filtre quand même sur le statut
            relevantReturns = returns.filter(r =>
                (r.status === 'approved' || r.status === 'restocked') && r.isRefunded
            );
        }

        // Déduire les retours du revenue de chaque vendeur
        // Déduire les retours du revenue de chaque vendeur
        relevantReturns.forEach(ret => {
            let serverId = ret.originalSeller || ret.serverId;

            // Si pas d'info directe sur le retour, on essaie de trouver via la vente originale
            if (!serverId) {
                const originalSale = sales.find(s => s.id === ret.saleId);
                if (originalSale) {
                    serverId = originalSale.soldBy;
                }
            }

            // Si on a trouvé un vendeur (directement ou via vente originale)
            if (serverId) {
                // Initialiser le userStats si ce n'est pas déjà fait (ex: retour sur vente passée d'un serveur qui n'a pas vendu aujourd'hui)
                if (!userStats[serverId]) {
                    const user = safeUsers.find(u => u.id === serverId);
                    const member = safeBarMembers.find(m => m.userId === serverId);
                    const role = member?.role || (user?.role) || 'serveur';
                    const userName = user?.name || 'Ancien membre';

                    userStats[serverId] = {
                        userId: serverId,
                        name: userName,
                        role,
                        revenue: 0,
                        sales: 0,
                        items: 0
                    };
                }

                userStats[serverId].revenue -= ret.refundAmount;
            }
        });

        return Object.values(userStats).sort((a, b) => b.revenue - a.revenue);

    }, [sales, returns, safeUsers, safeBarMembers, startDate, endDate, closeHour]);
}
