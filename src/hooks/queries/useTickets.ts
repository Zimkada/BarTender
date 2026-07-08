import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, useEffect, useCallback } from 'react';
import { TicketsService, type TicketRow } from '../../services/supabase/tickets.service';
import { useSales, mapSalesData } from './useSalesQueries';
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

// ===== Fenêtre commerciale =====

/** Début de fenêtre = veille de la journée commerciale courante (YYYY-MM-DD) */
function computeSalesWindowStart(): string {
    const pivot = calculateBusinessDate(new Date(), BUSINESS_DAY_CLOSE_HOUR);
    pivot.setDate(pivot.getDate() - 1);
    return dateToYYYYMMDD(pivot);
}

/** Fréquence de revérification du changement de journée commerciale */
export const SALES_WINDOW_RECHECK_MS = 5 * 60 * 1000;

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

    // ⚡ Egress: fenêtre bornée à journée courante + veille (garde-fou egress —
    // évite le Cas 2 full-scan de getBarSales, items jsonb inclus, cap 500).
    // Les BONS OUVERTS, eux, ne sont volontairement PAS bornés par date (cf.
    // TicketsService.getOpenTickets) : un bon reste payable quel que soit son
    // âge (pay_ticket propage payment_method aux ventes rattachées). Pour un
    // bon dont created_at précède cette fenêtre, ses ventes sont récupérées à
    // part par ticket_id (staleSales ci-dessous) — cas rare, fetch ciblé et
    // léger, jamais un scan complet.
    //
    // La fenêtre doit SUIVRE la journée commerciale : l'écran POS reste monté
    // des heures, parfois d'un jour à l'autre sans reload. Figée au montage,
    // elle s'élargirait silencieusement au fil des jours — la dérive egress que
    // cette borne vise justement à empêcher. State + revérification périodique
    // et au retour de focus : la valeur (string primitive) ne change que si la
    // journée commerciale a réellement basculé, donc query keys stables et
    // aucun refetch entre deux bascules.
    const [salesWindowStart, setSalesWindowStart] = useState(computeSalesWindowStart);
    useEffect(() => {
        const recheck = () => {
            // setState fonctionnel + bail-out React : valeur identique → no-op
            setSalesWindowStart(prev => {
                const next = computeSalesWindowStart();
                return next === prev ? prev : next;
            });
        };
        const intervalId = setInterval(recheck, SALES_WINDOW_RECHECK_MS);
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') recheck();
        };
        window.addEventListener('focus', recheck);
        document.addEventListener('visibilitychange', handleVisibility);
        return () => {
            clearInterval(intervalId);
            window.removeEventListener('focus', recheck);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, []);
    // Ventes déjà dans le cache — used pour le join client-side
    const { data: sales = [] } = useSales(barId, { startDate: salesWindowStart });

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
            return await TicketsService.getOpenTickets(barId);
        },
        enabled: !!barId,
        staleTime: CACHE_STRATEGY.salesAndStock.staleTime,
        gcTime: CACHE_STRATEGY.salesAndStock.gcTime,
    });

    // 🛡️ Bons ouverts plus anciens que salesWindowStart : leurs ventes ne sont
    // pas dans `sales` (hors fenêtre). Fetch ciblé par ticket_id — rare (bon
    // oublié, jour de fermeture) et léger (quelques bons, jamais un scan bar
    // entier) — pour que totalAmount/productSummary restent exacts et que le
    // bon reste réglable. Sans ça, un bon ancien mais réellement non-vide
    // s'afficherait "Bon vide / 0 XOF" (cf. commentaire getOpenTickets).
    const staleTicketIds = useMemo(() => {
        const cutoff = new Date(salesWindowStart + 'T00:00:00');
        return serverTickets
            .filter(t => new Date(t.created_at) < cutoff)
            .map(t => t.id);
    }, [serverTickets, salesWindowStart]);

    const { data: staleSales = [] } = useQuery({
        queryKey: [...ticketKeys.open(barId || ''), 'stale-sales', staleTicketIds, salesWindowStart],
        queryFn: async (): Promise<Sale[]> => {
            if (!barId || staleTicketIds.length === 0) return [];
            // ⚠️ beforeDate = salesWindowStart : borne obligatoire pour que
            // staleSales et `sales` (fenêtre récente) restent des ensembles
            // DISJOINTS. Sans elle, une vente récente d'un bon ancien serait
            // comptée deux fois dans allRelevantSales (double-comptage financier).
            const dbSales = await SalesService.getSalesByTicketIds(staleTicketIds, barId, salesWindowStart);
            return mapSalesData(dbSales);
        },
        enabled: !!barId && staleTicketIds.length > 0,
        staleTime: CACHE_STRATEGY.salesAndStock.staleTime,
        gcTime: CACHE_STRATEGY.salesAndStock.gcTime,
    });

    // Ventes utilisées pour le join : fenêtre récente (business_date >= salesWindowStart)
    // + ventes ciblées des bons anciens (business_date < salesWindowStart, cf. staleSales
    // ci-dessus) — ensembles disjoints par construction en régime établi.
    // 🛡️ Exception transitoire : à la bascule de journée commerciale, `sales`
    // conserve l'ancienne fenêtre (plus large) en placeholderData pendant son
    // refetch, alors que staleSales peut déjà avoir résolu avec le nouveau
    // beforeDate → une même vente peut apparaître dans les deux quelques
    // secondes. Dédoublonnage par id : disjonction structurelle, no-op sinon.
    const allRelevantSales = useMemo(() => {
        if (staleSales.length === 0) return sales;
        const recentSaleIds = new Set(sales.map(s => s.id));
        return [...sales, ...staleSales.filter(s => !recentSaleIds.has(s.id))];
    }, [sales, staleSales]);

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
            const hasEverHadSales = allRelevantSales.some(s => s.ticketId === ticket.id)
                || offlineQueueSales.some(s => (s.ticketId || s.ticket_id) === ticket.id);

            // 1. Filtrer les ventes online validées pour ce ticket
            const onlineTicketSales = allRelevantSales.filter(
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
    }, [tickets, allRelevantSales, mappings, offlineQueueSales, returns]);

    const refetchTickets = async () => {
        // 1. Force refresh offline data immediately (no debounce) but don't block
        refreshOfflineData().catch(console.error);
        // 2. Force refetch online data but don't block
        queryClient.invalidateQueries({ queryKey: ticketKeys.open(barId || '') }).catch(console.error);
    };

    return { tickets: ticketsWithSummary, isLoading, refetchTickets };
}
