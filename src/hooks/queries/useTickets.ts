import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { TicketsService } from '../../services/supabase/tickets.service';
import { useSales } from './useSalesQueries';
import type { Ticket } from '../../types';
import { CACHE_STRATEGY } from '../../lib/cache-strategy';

// ===== Query Keys =====
export const ticketKeys = {
    all: ['tickets'] as const,
    open: (barId: string) => [...ticketKeys.all, 'open', barId] as const,
};

// ===== Ticket enrichi avec résumé calculé depuis les ventes =====
export interface TicketWithSummary extends Ticket {
    /** Label pour le sélecteur : "2 Bières Flag, 1 Whisky" ou "Bon vide" */
    productSummary: string;
    /** Somme des totaux des ventes non annulées/rejetées sur ce ticket */
    totalAmount: number;
    /** Nombre de ventes sur ce ticket */
    salesCount: number;
}

/**
 * Fetche les tickets ouverts du bar et les enrichit avec un résumé produits
 * calculé depuis les ventes déjà dans le cache React Query (useSales).
 *
 * Le résumé est utilisé comme identifiant visuel dans le sélecteur de bon :
 *   "2 Bières Flag, 1 Whisky • 5 000 FCFA"
 * Si aucune vente sur le ticket : "Bon vide"
 *
 * NOTE : Pour les montants financiers dans la facture, on ne se base PAS sur
 * ces totaux — InvoiceModal fait un fetch direct via getSalesByTicketId.
 */
export function useTickets(barId: string | undefined) {
    const queryClient = useQueryClient();

    // Ventes déjà dans le cache — used pour le join client-side
    const { data: sales = [] } = useSales(barId);

    const { data: tickets = [], isLoading } = useQuery({
        queryKey: ticketKeys.open(barId || ''),
        queryFn: async (): Promise<Ticket[]> => {
            if (!barId) return [];
            const rows = await TicketsService.getOpenTickets(barId);
            return rows.map(t => ({
                id: t.id,
                barId: t.bar_id,
                status: t.status as 'open' | 'paid',
                createdBy: t.created_by,
                serverId: t.server_id || undefined,
                createdAt: new Date(t.created_at),
                paidAt: t.paid_at ? new Date(t.paid_at) : undefined,
                paidBy: t.paid_by || undefined,
                ticketNumber: t.ticket_number,
                notes: t.notes || undefined,
            }));
        },
        enabled: !!barId,
        staleTime: CACHE_STRATEGY.salesAndStock.staleTime,
        gcTime: CACHE_STRATEGY.salesAndStock.gcTime,
    });

    // Derive ticketsWithSummary — join client-side contre les ventes en cache
    const ticketsWithSummary: TicketWithSummary[] = useMemo(() => {
        return tickets.map(ticket => {
            const ticketSales = sales.filter(
                s => s.ticketId === ticket.id && s.status !== 'rejected' && s.status !== 'cancelled'
            );

            // Agrégation des produits sur toutes les ventes du ticket
            const productMap = new Map<string, number>(); // productName → quantité totale
            let totalAmount = 0;

            ticketSales.forEach(sale => {
                totalAmount += sale.total;
                (sale.items || []).forEach((item: any) => {
                    const name = item.product_name || item.productName || 'Produit';
                    productMap.set(name, (productMap.get(name) || 0) + (item.quantity || 1));
                });
            });

            // Label : top 3 produits par quantité
            const parts = Array.from(productMap.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([name, qty]) => `${qty} ${name}`);

            const productSummary = parts.length > 0 ? parts.join(', ') : 'Bon vide';

            return {
                ...ticket,
                productSummary,
                totalAmount,
                salesCount: ticketSales.length,
            };
        });
    }, [tickets, sales]);

    // Invalider les tickets après une nouvelle vente (pour rafraîchir les résumés)
    const refetchTickets = () => {
        queryClient.invalidateQueries({ queryKey: ticketKeys.open(barId || '') });
    };

    return { tickets: ticketsWithSummary, isLoading, refetchTickets };
}
