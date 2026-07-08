
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { SalesService, type DBSale } from '../../services/supabase/sales.service';
import type { Sale, SaleItem } from '../../types';
import { CACHE_STRATEGY } from '../../lib/cache-strategy';
import { useSmartSync } from '../useSmartSync';
import type { RealtimeChangePayload } from '../useRealtimeSubscription';
import { applySaleEventToList, coerceSaleRowNumerics, applyPendingSaleEvent, type PendingStockSale, type SalesListPatch } from '../../utils/realtimeCachePatch';
import { z } from 'zod';

// 🛡️ Fix V12: Runtime Validation
const SaleItemSchema = z.object({
    product_id: z.string(),
    product_name: z.string(),
    quantity: z.number(),
    unit_price: z.number(),
    total_price: z.number(),
    // Optional legacy fields
    original_unit_price: z.number().optional(),
    discount_amount: z.number().optional(),
    promotion_id: z.string().optional(),
}).passthrough(); // Allow extra fields without crashing

const DBSaleItemsSchema = z.array(SaleItemSchema);

export const salesKeys = {
    all: ['sales'] as const,
    list: (barId: string) => [...salesKeys.all, 'list', barId] as const,
    detail: (id: string) => [...salesKeys.all, 'detail', id] as const,
    stats: (barId: string) => [...salesKeys.all, 'stats', barId] as const,
};

export interface UseSalesOptions {
    startDate?: string;
    endDate?: string;
    searchTerm?: string;
    status?: string;
    includeItems?: boolean;
    enabled?: boolean;
}

/**
 * ⚡ Egress : applique un patch (INSERT/UPDATE/DELETE d'une vente) à TOUTES les
 * variantes de `salesKeys.list(barId)` en cache, chacune selon ses propres
 * filtres (fenêtre business_date, status, includeItems, plafond 500).
 *
 * Source unique de vérité du patch de liste — utilisée par le flux Realtime
 * (applySaleChange ci-dessous) ET par les onSuccess de useSalesMutations (à la
 * place de l'invalidation par préfixe qui refetchait toutes les fenêtres 7-60j
 * à chaque vente — cf. diagnostic egress 07/07/2026).
 *
 * Cas non patchables → `invalidateVariants([key])` (refetch ciblé de CETTE
 * variante uniquement) :
 *  - variante avec `searchTerm` (ilike serveur, non évaluable localement) ;
 *  - DELETE sur une variante sans bornes de dates ET pleine (500) : retirer
 *    localement laisserait 499 lignes sans récupérer la 500e suivante.
 */
export function patchSalesListVariants(
    queryClient: QueryClient,
    barId: string,
    patch: SalesListPatch,
    invalidateVariants: (keys: readonly (readonly unknown[])[]) => void,
): void {
    const listPrefix = salesKeys.list(barId);
    // Index des options dérivé du préfixe (résiste à un changement de forme de salesKeys.list)
    const optionsIndex = listPrefix.length;
    const entries = queryClient.getQueriesData<Sale[]>({ queryKey: listPrefix });
    if (entries.length === 0) return; // rien en cache → rien à resynchroniser

    if (patch.type === 'DELETE') {
        entries.forEach(([key, data]) => {
            if (!data) return;
            const opts = (key[optionsIndex] ?? {}) as UseSalesOptions;
            // Variante plafonnée serveur (pas de dates → limit(500)) ET pleine :
            // retirer localement laisserait 499 lignes sans récupérer la 500e
            // suivante → refetch ciblé de cette variante.
            if (!opts.startDate && !opts.endDate && data.length >= 500 && data.some(s => s.id === patch.id)) {
                invalidateVariants([key]);
                return;
            }
            const next = applySaleEventToList(data, patch, {});
            if (next !== data) queryClient.setQueryData(key, next);
        });
        return;
    }

    const { sale, businessDate } = patch;
    for (const [key, data] of entries) {
        const opts = (key[optionsIndex] ?? {}) as UseSalesOptions;

        if (opts.searchTerm) {
            // ilike côté serveur — non évaluable localement → refetch ciblé de
            // cette variante uniquement
            invalidateVariants([key]);
            continue;
        }
        if (!data) continue;

        const saleForVariant = opts.includeItems === false
            ? { ...sale, items: [] }
            : sale;

        const next = applySaleEventToList(
            data,
            { type: patch.type, sale: saleForVariant, businessDate },
            {
                startDate: opts.startDate,
                endDate: opts.endDate,
                status: opts.status,
                // Variante sans bornes de dates → le serveur cape à 500 (getBarSales Cas 2)
                limit: (!opts.startDate && !opts.endDate) ? 500 : undefined,
            },
        );
        if (next !== data) queryClient.setQueryData(key, next);
    }
}

export const useSales = (barId: string | undefined, options?: UseSalesOptions) => {
    const isEnabled = !!barId && (options?.enabled ?? true);
    const queryClient = useQueryClient();

    // ⚡ Egress: patch ciblé du cache ventes depuis le payload Realtime.
    // Chaque variante de liste en cache ([...salesKeys.list(barId), options]) est
    // patchée selon ses propres filtres (fenêtre business_date, status). Les variantes
    // avec searchTerm (ilike serveur, non évaluable localement) sont invalidées
    // individuellement. Évite de refetcher 7-60 jours de ventes à chaque événement.
    const applySaleChange = useCallback((
        payload: RealtimeChangePayload,
        throttledInvalidate: (keys: readonly (readonly unknown[])[]) => void,
    ): boolean => {
        // Contrat queryKeysToInvalidate : le patch ne reconstruit jamais les stats →
        // on invalide toujours cette clé (no-op tant qu'aucune query n'y est attachée,
        // future-proof si l'une s'y attache un jour). Via le throttle anti-burst :
        // une rafale realtime (ex: replay offline) ne produit qu'1 invalidation/s.
        throttledInvalidate([salesKeys.stats(barId || '')]);

        // ----------------------------------------------------
        // ⚡ Patch additionnel pour la requête de stock (serverPendingSales)
        // Permet au calcul de 'availableStock' d'être instantané sur tous les appareils
        // ----------------------------------------------------
        const pendingStockKey = ['server-pending-sales-for-stock', barId || ''];
        const pendingSales = queryClient.getQueryData<PendingStockSale[]>(pendingStockKey);

        // ⚠️ Race condition (garde-fou anti-survente) : si la query initiale de
        // useUnifiedStock n'a pas encore résolu (cache undefined) au moment où cet
        // événement arrive, le patch est ignoré silencieusement — la query initiale,
        // lancée AVANT cet événement, peut alors écrire une liste qui ne contient
        // pas cette vente pending. availableStock resterait temporairement trop
        // haut. Repli conservateur (même principe que payload.old absent) :
        // invalidation ciblée et throttlée dès qu'un événement pending-relevant
        // survient sans cache exploitable.
        if (pendingSales === undefined) {
            throttledInvalidate([pendingStockKey]);
        } else {
            const rawSale = payload.new as { id?: string; status?: string; items?: unknown; idempotency_key?: string } | undefined;
            const saleId = rawSale?.id || (payload.old as { id?: string } | undefined)?.id;
            const result = applyPendingSaleEvent(pendingSales, {
                eventType: payload.eventType,
                id: saleId,
                status: rawSale?.status,
                items: rawSale?.items,
                idempotency_key: rawSale?.idempotency_key,
            });
            if ('refetch' in result) {
                // items illisible pour une vente pending : un patch écrirait items:[]
                // et sous-déduirait silencieusement availableStock → refetch ciblé.
                throttledInvalidate([pendingStockKey]);
            } else if (result.next !== null) {
                queryClient.setQueryData(pendingStockKey, result.next);
            }
        }

        // ----------------------------------------------------
        // Patch de la liste principale des ventes
        // (logique partagée avec les onSuccess de useSalesMutations —
        // cf. patchSalesListVariants, source unique de vérité)
        // ----------------------------------------------------
        if (payload.eventType === 'DELETE') {
            const id = (payload.old as { id?: string } | undefined)?.id;
            if (!id) return false;
            patchSalesListVariants(queryClient, barId || '', { type: 'DELETE', id }, throttledInvalidate);
            return true;
        }

        const raw = payload.new as DBSale | undefined;
        if (!raw?.id || !raw.business_date) return false;

        // ⚠️ Realtime sérialise les colonnes NUMERIC en chaînes (PostgREST renvoie
        // des nombres) → coercition obligatoire avant d'injecter dans le cache,
        // sinon les sommes de CA concatènent des strings.
        const row = coerceSaleRowNumerics(raw);
        const mapped = mapSalesData([row])[0];
        // .slice(0,10) : business_date est de type `date` (déjà YYYY-MM-DD) —
        // durcissement zéro-risque si le type de colonne évoluait.
        const businessDate = String(row.business_date).slice(0, 10);

        patchSalesListVariants(
            queryClient,
            barId || '',
            { type: payload.eventType, sale: mapped, businessDate },
            throttledInvalidate,
        );
        return true;
    }, [barId, queryClient]);

    // 🔧 PHASE 1-2: SmartSync pour sales (INSERT car nouvelles ventes)
    const smartSync = useSmartSync({
        table: 'sales',
        event: '*', // 🚀 FIX: Écouter TOUS les changements (UPDATE pour validation, DELETE, INSERT)
        barId: barId || undefined,
        enabled: isEnabled,
        staleTime: CACHE_STRATEGY.salesAndStock.staleTime,
        refetchInterval: 30000,
        queryKeysToInvalidate: [
            salesKeys.list(barId || ''),
            salesKeys.stats(barId || ''),
            // Couvre la réconciliation-reconnexion pour le patch pendingStockKey
            // ci-dessus (garde-fou anti-survente) — sans cette clé, un événement
            // manqué pendant une coupure du canal Realtime (zombie websocket,
            // channel error...) n'était jamais rattrapé par ce mécanisme.
            ['server-pending-sales-for-stock', barId || '']
        ],
        applyChange: applySaleChange // ⚡ Egress: patch au lieu de refetch
    });

    return useQuery({
        queryKey: [...salesKeys.list(barId || ''), options] as unknown[],
        networkMode: 'always', // 🛡️ CRITIQUE: Permet l'accès au cache même offline
        queryFn: async (): Promise<Sale[]> => {
            if (!barId) return [];
            const dbSales = await SalesService.getBarSales(barId, options);
            // Plus besoin de cast complexe, getBarSales retourne DBSale[]
            return mapSalesData(dbSales);
        },
        enabled: isEnabled,
        staleTime: CACHE_STRATEGY.salesAndStock.staleTime,
        gcTime: CACHE_STRATEGY.salesAndStock.gcTime,
        refetchInterval: smartSync.adaptedRefetchInterval, // 🚀 Hybride: Realtime ou polling adaptatif (2G: off, 3G: 90s, 4G: 30s)
        placeholderData: (previousData: Sale[] | undefined) => previousData, // 🛡️ Fix V12: Typage strict
    });
};

// Helper to map DB sales to frontend type
// 🛡️ Fix V12: Typed input instead of any[]
export const mapSalesData = (dbSales: DBSale[]): Sale[] => {
    return dbSales.map(s => {
        // 🛡️ Validation Runtime des items (Critical Path)
        // On sécurise les items mal formés qui pourraient crasher l'UI
        let items: SaleItem[] = [];
        const rawItems = typeof s === 'object' && s !== null && 'items' in s
            ? (s as DBSale & { items?: unknown }).items
            : undefined;
        try {
            if (Array.isArray(rawItems)) {
                // On accepte que rawItems soit n'importe quoi venant de la DB (jsonb)
                // et on le parse/valide avec Zod
                items = DBSaleItemsSchema.parse(rawItems) as unknown as SaleItem[];
            }
        } catch (e) {
            console.warn(`[mapSalesData] Invalid items for sale ${s.id}`, e);
            items = []; // Fallback safe
        }

        return {
            id: s.id,
            barId: s.bar_id,
            items: items,
            subtotal: s.subtotal,
            discount: s.discount_total || 0, // Handle null
            total: s.total,
            currency: 'XOF',
            paymentMethod: (s.payment_method as 'cash' | 'mobile_money' | 'card' | 'credit') || 'cash',
            status: (s.status as 'pending' | 'validated' | 'rejected') || 'pending',
            createdBy: s.created_by || 'unknown',  // ✨ FIX: Audit trail - qui a cliqué créer
            soldBy: s.sold_by || 'unknown',        // ✨ FIX: Attribution métier - qui reçoit le crédit
            createdAt: new Date(s.created_at!), // created_at can be null in types but likely not in DB for sales
            validatedBy: s.validated_by || undefined,
            validatedAt: s.validated_at ? new Date(s.validated_at) : undefined,
            rejectedBy: s.rejected_by || undefined,
            rejectedAt: s.rejected_at ? new Date(s.rejected_at) : undefined,
            businessDate: s.business_date ? new Date(s.business_date) : new Date(),
            customerName: s.customer_name || undefined,
            customerPhone: s.customer_phone || undefined,
            notes: s.notes || undefined,
            serverId: s.server_id || undefined,
            // 🛡️ Fix V12: Safe access thanks to DBSale
            ticketId: s.ticket_id || undefined,
            idempotencyKey: s.idempotency_key || undefined,
            sourceReturnId: s.source_return_id || undefined,
            items_count: s.items_count ?? undefined,
        };
    });
};
