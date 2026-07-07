import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, useEffect, useCallback } from 'react';
import { TicketsService, type TicketRow } from '../../services/supabase/tickets.service';
import { useSales } from './useSalesQueries';
import type { Ticket, Sale, SaleItem } from '../../types';
import { CACHE_STRATEGY } from '../../lib/cache-strategy';
import { useServerMappings } from '../useServerMappings';
import { useAuth } from '../../context/AuthContext';
import { SalesService, type OfflineSale } from '../../services/supabase/sales.service';
import { syncManager } from '../../services/SyncManager';
import { offlineQueue } from '../../services/offlineQueue';
import { useUnifiedReturns } from '../pivots/useUnifiedReturns';
import { calculateBusinessDate, dateToYYYYMMDD } from '../../utils/businessDateHelpers';
import { BUSINESS_DAY_CLOSE_HOUR } from '../../config/constants';

// ===== Type-Safe Declarations =====

/** Payload stocké dans la queue offline pour CREATE_TICKET — doit rester en sync avec TicketsService.createTicket */
interface CreateTicketPayload {
    bar_id: string;
    created_by: string;
    notes: string | null;
    server_id: string | null;
    closing_hour: number;
    table_number: number | null;
    customer_name: string | null;
    idempotency_key: string;
    temp_id: string;
}

/**
 * ✅ TicketRow enrichi avec flag optimiste pour tickets créés offline
 * Les tickets optimistes (pending sync) ont isOptimistic = true
 */
interface TicketRowWithOptimistic extends TicketRow {
    isOptimistic?: boolean;
}

/**
 * ✅ Sale avec dual-casing support pour idempotency_key
 * Online sales use camelCase (idempotencyKey)
 * Offline sales use snake_case (idempotency_key)
 */
interface SaleWithDualCasing extends Sale {
    idempotency_key?: string; // Support snake_case variant
}

/**
 * ✅ SaleItem avec dual-casing support pour compatibilité online/offline
 * product_name (snake_case) : Format DB standard
 * productName (camelCase) : Fallback pour certaines transformations
 */
interface SaleItemWithDualCasing extends SaleItem {
    productName?: string; // Fallback camelCase variant
}

/**
 * ✅ Type union pour ventes online/offline avec support dual-casing
 */
type UnifiedSale = (Sale | OfflineSale) & {
    idempotency_key?: string;
    items: SaleItemWithDualCasing[];
};

// ===== Query Keys =====
export const ticketKeys = {
    all: ['tickets'] as const,
    open: (barId: string) => [...ticketKeys.all, 'open', barId] as const,
};

export interface TicketWithSummary extends Ticket {
    /** Label pour le sélecteur : "2 Bières Flag, 1 Whisky" ou "Bon vide" */
    productSummary: string;
    /** Somme des totaux des ventes non annulées/rejetées sur ce ticket */
    totalAmount: number;
    /** Nombre de ventes sur ce ticket */
    salesCount: number;
    /** Nom du serveur résolu via les mappings */
    serverName?: string;
    /** Indicateur de ticket créé offline */
    isOptimistic?: boolean;
    /** Interne : true si le bon a eu des ventes, toutes rejetées/annulées (filtré avant retour) */
    isGhost?: boolean;
}

/**
 * Fetche les tickets ouverts du bar et les enrichit avec un résumé produits
 * calculé depuis les ventes déjà dans le cache React Query (useSales)
 * ET les ventes en attente dans la offlineQueue.
 */
export function useTickets(barId: string | undefined) {
    const queryClient = useQueryClient();
    const { currentSession } = useAuth();
    const isServerRole = currentSession?.role === 'serveur';

    // ⚡ Egress + cohérence : fenêtre commerciale PARTAGÉE (journée courante +
    // veille) appliquée aux DEUX requêtes — bons ouverts (created_at) et ventes
    // (business_date). Les bons sont un outil de point journalier sans portée
    // financière (les ventes restent la vérité comptable) ; la veille est gardée
    // pour un client qui consomme à cheval sur deux journées commerciales.
    // Invariant anti "bon vide fantôme" : tout bon visible a forcément ses ventes
    // dans la fenêtre chargée — un bon ne peut plus afficher "Bon vide / 0" parce
    // que ses ventes seraient plus anciennes que la fenêtre. Ne jamais borner
    // l'une sans l'autre (test dédié dans useTickets.test.tsx).
    // Sans borne sur les ventes, useSales tombait dans le Cas 2 de getBarSales
    // (bar_id seul, sans filtre business_date) : scan de TOUT l'historique du bar
    // (items jsonb inclus) plafonné à 500 lignes — coûteux en egress car le tri
    // sur l'historique complet précède la troncature. items reste nécessaire ici
    // (résumé produits du bon, ligne ~277).
    const businessWindow = useMemo(() => {
        const pivot = calculateBusinessDate(new Date(), BUSINESS_DAY_CLOSE_HOUR);
        pivot.setDate(pivot.getDate() - 1); // veille commerciale
        return {
            // Borne ventes : business_date >= veille (YYYY-MM-DD)
            salesStartDate: dateToYYYYMMDD(pivot),
            // Borne bons : la journée commerciale de la veille démarre à closeHour
            ticketsCreatedAfter: new Date(
                pivot.getFullYear(), pivot.getMonth(), pivot.getDate(),
                BUSINESS_DAY_CLOSE_HOUR
            ).toISOString(),
        };
    }, []);
    // Ventes déjà dans le cache — used pour le join client-side
    const { data: sales = [] } = useSales(barId, { startDate: businessWindow.salesStartDate });

    // Mappings serveurs pour résoudre les noms
    const { mappings = [] } = useServerMappings(barId);

    // 🔄 Retours unifiés (Online + Offline) pour déduction
    const { returns = [] } = useUnifiedReturns(barId);

    // 📊 Offline Cache (Phase 13)
    const [offlineQueueSales, setOfflineQueueSales] = useState<OfflineSale[]>([]);
    const [pendingTickets, setPendingTickets] = useState<TicketRow[]>([]);
    const [pendingPayouts, setPendingPayouts] = useState<Set<string>>(new Set());

    // 🚀 Réactivité Instantanée (Phase 13)
    const refreshOfflineData = useCallback(async () => {
        if (!barId) return;
        try {
            const [salesData, ops] = await Promise.all([
                SalesService.getOfflineSales(barId),
                // 🛡️ FIX VISIBILITÉ (Phase 15): Récupérer TOUTES les opérations pour filtrer manuellement.
                // Si on demande juste 'pending', les tickets 'syncing' ou 'error' disparaissent de l'UI.
                offlineQueue.getOperations({ barId })
            ]);

            setOfflineQueueSales(salesData);

            // Extraire les tickets optimistes (pending, syncing, error)
            const optimisticTickets: TicketRow[] = ops
                .filter(op =>
                    op.type === 'CREATE_TICKET' &&
                    (op.status === 'pending' || op.status === 'syncing' || op.status === 'error')
                )
                .map(op => {
                    const payload = op.payload as CreateTicketPayload;
                    return {
                        id: payload.temp_id,
                        bar_id: op.barId,
                        status: 'open',
                        created_by: payload.created_by,
                        server_id: payload.server_id || null,
                        created_at: new Date(op.timestamp).toISOString(),
                        paid_at: null,
                        paid_by: null,
                        payment_method: null,
                        ticket_number: 0, // 0 = "En attente"
                        notes: payload.notes || null,
                        table_number: payload.table_number || null,
                        customer_name: payload.customer_name || null,
                        isOptimistic: true
                    } as TicketRow;
                });

            setPendingTickets(optimisticTickets);

            // Tracker les transactions de paiement en cours
            const payouts = new Set<string>(
                ops.filter(op => op.type === 'PAY_TICKET').map(op => op.payload.ticket_id)
            );
            setPendingPayouts(payouts);
        } catch (err) {
            console.error('[useTickets] Error fetching offline data:', err);
        }
    }, [barId]);

    useEffect(() => {
        refreshOfflineData();

        // 🛡️ AMORTISSEUR (Debounce)
        let timeout: NodeJS.Timeout;
        const handleQueueUpdate = () => {
            clearTimeout(timeout);
            timeout = setTimeout(refreshOfflineData, 150);
        };

        window.addEventListener('queue-updated', handleQueueUpdate);
        window.addEventListener('sync-completed', handleQueueUpdate);
        return () => {
            clearTimeout(timeout);
            window.removeEventListener('queue-updated', handleQueueUpdate);
            window.removeEventListener('sync-completed', handleQueueUpdate);
        };
    }, [refreshOfflineData]);

    const { data: serverTickets = [], isLoading } = useQuery({
        queryKey: ticketKeys.open(barId || ''),
        queryFn: async (): Promise<TicketRow[]> => {
            if (!barId) return [];
            return await TicketsService.getOpenTickets(barId, businessWindow.ticketsCreatedAfter);
        },
        enabled: !!barId,
        staleTime: CACHE_STRATEGY.salesAndStock.staleTime,
        gcTime: CACHE_STRATEGY.salesAndStock.gcTime,
    });

    // 🔄 Transformation des données avec injection Offline
    const tickets: Ticket[] = useMemo(() => {
        // 1. Filtrer les tickets déjà payés offline
        const filteredServerTickets = serverTickets.filter(t => !pendingPayouts.has(t.id));

        // 2. Fusionner avec les tickets optimistes
        const allBaseTickets = [...filteredServerTickets, ...pendingTickets];

        // 3. Filtrage par serveur pour les rôles 'serveur'
        const visibleTickets = isServerRole
            ? allBaseTickets.filter(t =>
                t.server_id === currentSession?.userId ||
                t.created_by === currentSession?.userId
            )
            : allBaseTickets;

        // ✅ Type-safe cast to access isOptimistic flag from offline tickets
        return visibleTickets.map(t => ({
            id: t.id,
            barId: t.bar_id,
            status: t.status as 'open' | 'paid',
            createdBy: t.created_by,
            serverId: t.server_id || undefined,
            createdAt: new Date(t.created_at),
            paidAt: t.paid_at ? new Date(t.paid_at) : undefined,
            paidBy: t.paid_by || undefined,
            paymentMethod: t.payment_method || undefined,
            ticketNumber: t.ticket_number,
            notes: t.notes || undefined,
            tableNumber: t.table_number || undefined,
            customerName: t.customer_name || undefined,
            isOptimistic: (t as TicketRowWithOptimistic).isOptimistic
        }));
    }, [serverTickets, pendingTickets, pendingPayouts, isServerRole, currentSession?.userId]);

    // Derive ticketsWithSummary — join client-side contre les ventes en cache + offline
    const ticketsWithSummary: TicketWithSummary[] = useMemo(() => {
        const recentlySyncedMap = syncManager.getRecentlySyncedKeys();

        const allTickets = tickets.map(ticket => {
            // 0. Le bon a-t-il déjà reçu au moins une vente (peu importe son statut) ?
            // Sert à distinguer un bon neuf (jamais utilisé, à garder) d'un bon
            // vidé de tout contenu actif (toutes ses ventes rejetées/annulées, à masquer).
            const hasEverHadSales = sales.some(s => s.ticketId === ticket.id)
                || offlineQueueSales.some(s => (s.ticketId || s.ticket_id) === ticket.id);

            // 1. Filtrer les ventes online validées pour ce ticket
            const onlineTicketSales = sales.filter(
                s => s.ticketId === ticket.id && s.status !== 'rejected' && s.status !== 'cancelled'
            );

            // 2. Filtrer les ventes offline en attente pour ce ticket (Dédoublonnées)
            const offlineTicketSales = offlineQueueSales.filter(s => {
                // 🛡️ DUAL-CASING SUPPORT (Phase 15): 
                // Vérifier les deux cas (camelCase & snake_case) grâce à l'harmonisation dans SalesService
                const saleTicketId = s.ticketId || s.ticket_id;
                const isForTicket = saleTicketId === ticket.id;

                if (!isForTicket) return false;

                // Anti-doublon flash : si déjà dans recentlySyncedMap AND dans onlineTicketSales, on ignore
                const idKey = s.idempotency_key;
                if (idKey && recentlySyncedMap.has(idKey)) {
                    // ✅ Type-safe dual-casing check: camelCase (standard) + snake_case (fallback)
                    const alreadyInOnline = onlineTicketSales.some(os =>
                        (os.idempotencyKey === idKey) || ((os as SaleWithDualCasing).idempotency_key === idKey)
                    );
                    if (alreadyInOnline) return false;
                }
                return true;
            });

            // 3. Fusionner les deux listes
            const allTicketSales = [...onlineTicketSales, ...offlineTicketSales];

            // 4. Récupérer les retours liés à ces ventes (non rejetés)
            const saleIds = new Set(allTicketSales.map(s => s.id));
            const relatedReturns = returns.filter(r =>
                saleIds.has(r.saleId) && r.status !== 'rejected'
            );

            // 5. Agrégation des produits sur toutes les ventes du ticket (NET)
            const productMap = new Map<string, number>();
            let totalAmount = 0;

            // ✅ Somme brute des ventes
            allTicketSales.forEach(sale => {
                totalAmount += (sale as UnifiedSale).total || 0;
                (sale.items || []).forEach((item: SaleItemWithDualCasing) => {
                    const name = item.product_name || item.productName || 'Produit';
                    productMap.set(name, (productMap.get(name) || 0) + (item.quantity || 1));
                });
            });

            // 📉 Déduction des retours
            relatedReturns.forEach(ret => {
                totalAmount -= ret.refundAmount || 0;
                const name = ret.productName || 'Produit';
                const currentQty = productMap.get(name) || 0;
                const newQty = Math.max(0, currentQty - ret.quantityReturned);

                if (newQty > 0) {
                    productMap.set(name, newQty);
                } else {
                    productMap.delete(name);
                }
            });

            // Label : top 3 produits par quantité
            const parts = Array.from(productMap.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([name, qty]) => `${qty} ${name}`);

            const productSummary = parts.length > 0 ? parts.join(', ') : 'Bon vide';

            // Résolution du nom du serveur via les mappings
            const mapping = mappings.find(m => m.userId === ticket.serverId);
            const serverName = mapping ? mapping.serverName : undefined;

            return {
                ...ticket,
                productSummary,
                totalAmount: Math.max(0, totalAmount), // Sécurité anti-négatif
                salesCount: allTicketSales.length,
                serverName,
                // 🛡️ Bon vide fantôme : toutes ses ventes ont été rejetées/annulées.
                // Masqué des bons ouverts (dashboard + sélecteur panier) — il ne reste
                // plus rien à payer. Un bon neuf jamais utilisé (hasEverHadSales=false)
                // est conservé pour rester sélectionnable.
                isGhost: hasEverHadSales && allTicketSales.length === 0
            };
        });

        return allTickets.filter(ticket => !ticket.isGhost);
    }, [tickets, sales, mappings, offlineQueueSales, returns]);

    const refetchTickets = async () => {
        // 1. Force refresh offline data immediately (no debounce) but don't block
        refreshOfflineData().catch(console.error);
        // 2. Force refetch online data but don't block
        queryClient.invalidateQueries({ queryKey: ticketKeys.open(barId || '') }).catch(console.error);
    };

    return { tickets: ticketsWithSummary, isLoading, refetchTickets };
}
