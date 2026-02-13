import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SalesService } from '../../services/supabase/sales.service';
import { salesKeys } from '../queries/useSalesQueries';
import { stockKeys } from '../queries/useStockQueries';
import { statsKeys } from '../queries/useStatsQueries';
import { useAuth } from '../../context/AuthContext';
import { useBarContext } from '../../context/BarContext';
import { calculateBusinessDate, dateToYYYYMMDD } from '../../utils/businessDateHelpers';
import { BUSINESS_DAY_CLOSE_HOUR } from '../../config/constants';
import type { Sale } from '../../types';
import { broadcastService } from '../../services/broadcast/BroadcastService';
import { Database } from '../../lib/database.types';
import { PaymentMethod } from '../../components/cart/PaymentMethodSelector';
import { SaleItem } from '../../types';
import toast from 'react-hot-toast';
import { z } from 'zod';
import { SaleItemSchema } from '../../utils/revenueSchemas';

type SaleRow = Database['public']['Tables']['sales']['Row'];

/**
 * Extension de SaleRow pour les champs optionnels ajoutés dynamiquement
 * (isOptimistic en offline, customer fields, etc.)
 */
interface SaleRowExtended extends SaleRow {
    isOptimistic?: boolean;
    customer_name: string | null;
    customer_phone: string | null;
    notes: string | null;
    source_return_id: string | null;
}

/**
 * 🛡️ Parse et valide les items provenant de la DB (type Json)
 * Retourne un tableau vide si la validation échoue
 */
const parseSaleItemsFromDb = (items: unknown): SaleItem[] => {
    const result = z.array(SaleItemSchema).safeParse(items);

    if (!result.success) {
        console.error('[useSalesMutations] Invalid items from DB:', result.error);
        return [];
    }

    // Les items validés par Zod sont compatibles avec SaleItem
    return result.data as SaleItem[];
};

/**
 * 🛡️ Valide et normalise les items de vente en snake_case
 * Filtre les items invalides et log les erreurs
 * @throws Error si aucun item valide n'est trouvé
 */
const validateAndNormalizeSaleItems = (items: unknown[]): Record<string, unknown>[] => {
    const validItems: Record<string, unknown>[] = [];

    items.forEach((item, index) => {
        const itemRecord = item as Record<string, unknown>;

        // Transform to snake_case (handles both camelCase and snake_case inputs)
        const normalized = {
            product_id: itemRecord.product_id || itemRecord.productId,
            product_name: itemRecord.product_name || itemRecord.productName,
            quantity: itemRecord.quantity,
            unit_price: itemRecord.unit_price || itemRecord.unitPrice,
            total_price: itemRecord.total_price || itemRecord.totalPrice,
            original_unit_price: itemRecord.original_unit_price || itemRecord.originalUnitPrice,
            discount_amount: itemRecord.discount_amount || itemRecord.discountAmount,
            promotion_id: itemRecord.promotion_id || itemRecord.promotionId,
            promotion_name: itemRecord.promotion_name || itemRecord.promotionName
        };

        // ✅ Validate with Zod schema
        const result = SaleItemSchema.safeParse(normalized);

        if (result.success) {
            validItems.push(result.data);
        } else {
            console.error(
                `[useSalesMutations] Invalid sale item at index ${index}:`,
                result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')
            );
        }
    });

    if (validItems.length === 0) {
        throw new Error('Aucun article valide dans la vente');
    }

    return validItems;
};

export const useSalesMutations = (barId: string) => {
    const queryClient = useQueryClient();
    const { currentSession } = useAuth();
    const { currentBar, isSimplifiedMode } = useBarContext();

    const isNetworkError = (error: unknown): boolean => {
        if (!(error instanceof Error)) return !navigator.onLine;

        // ✅ Type-safe error code extraction
        const errorCode = typeof error === 'object' && error !== null && 'code' in error
            ? String((error as Record<string, unknown>).code)
            : '';

        return (
            !navigator.onLine ||
            error.message === 'Failed to fetch' ||
            error.message.includes('NetworkError') ||
            error.message.includes('connection') ||
            error.message.includes('Internet') ||
            errorCode === 'PGRST000'
        );
    };

    const createSale = useMutation<Sale, unknown, Partial<Sale> & { items: SaleItem[] }, unknown>({
        mutationFn: async (saleData: Partial<Sale> & { items: SaleItem[] }) => {
            console.log('[useSalesMutations] mutationFn triggered', saleData);

            // 1. Préparer les données
            const closeHour = currentBar?.closingHour ?? BUSINESS_DAY_CLOSE_HOUR;
            const businessDate = calculateBusinessDate(new Date(), closeHour);
            const formattedBusinessDate = dateToYYYYMMDD(businessDate);

            // ✅ Validate and normalize items with Zod (filters invalid items)
            const itemsFormatted = validateAndNormalizeSaleItems(saleData.items);

            const soldByValue = isSimplifiedMode && saleData.serverId
                ? saleData.serverId
                : (currentSession?.userId || '');

            const role = currentSession?.role;
            const isManagerOrAdmin = role === 'super_admin' || role === 'promoteur' || role === 'gerant';

            // 🛡️ DECISION CRITIQUE (V11.4): Une vente offline par un gérant/admin est VALIDÉE par défaut.
            // Cela évite qu'elle ne disparaisse du CA global après synchronisation.
            const finalStatus = (isManagerOrAdmin || isSimplifiedMode)
                ? 'validated'
                : (saleData.status || 'pending');

            const validatedByValue = (finalStatus === 'validated')
                ? (currentSession?.userId || null)
                : null;

            // ✅ Type-safe sale payload construction
            const saleDataExtended = saleData as Partial<Sale> & {
                items: SaleItem[];
                customerName?: string;
                customerPhone?: string;
                notes?: string;
            };

            const salePayload = {
                bar_id: barId,
                items: itemsFormatted as unknown as SaleItem[],
                payment_method: saleData.ticketId ? 'ticket' : (saleData.paymentMethod || 'cash'),
                sold_by: soldByValue,
                server_id: saleData.serverId || undefined,
                ticket_id: saleData.ticketId || undefined,
                validated_by: validatedByValue || undefined,
                status: finalStatus as 'pending' | 'validated',
                customer_name: saleDataExtended.customerName,
                customer_phone: saleDataExtended.customerPhone,
                notes: saleDataExtended.notes,
                business_date: formattedBusinessDate,
                source_return_id: (saleData as any).sourceReturnId || undefined,
                idempotency_key: (saleData as any).idempotencyKey || undefined // 🛡️ Fix : Toujours passer la clé si fournie
            };

            console.log('[useSalesMutations] payload prepared for SalesService:', {
                ...salePayload,
                items_count: salePayload.items.length
            });

            console.log('[useSalesMutations] payload prepared', salePayload);

            if (!salePayload.sold_by) {
                console.error('[useSalesMutations] No user ID found for sale');
                throw new Error('Utilisateur non connecté');
            }

            const safetyTimeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('GLOBAL_MUTATION_TIMEOUT')), 15000)
            );

            console.log('[useSalesMutations] calling SalesService.createSale with 15s safety race', { canWorkOffline: !!role });

            const savedSaleRow = await Promise.race([
                SalesService.createSale(
                    salePayload,
                    {
                        canWorkOffline: !!role,
                        userId: currentSession?.userId || ''
                    }
                ),
                safetyTimeoutPromise
            ]) as SaleRow;

            console.log('[useSalesMutations] SalesService.createSale returned', savedSaleRow.id);

            const isOptimistic = savedSaleRow.id?.startsWith('sync_');

            if (isOptimistic) {
                console.log('[useSalesMutations] optimistic sale detected, showing toast');
                if (role === 'serveur') {
                    toast.error(
                        "⚠️ Signal réseau faible. Vente mise en attente locale.\nATTENTION : Le gérant ne recevra cette demande qu'après synchronisation automatique.",
                        {
                            duration: 8000,
                            icon: '📡',
                            style: { background: '#dc2626', color: '#fff', fontWeight: 'bold', border: '2px solid #fff' }
                        }
                    );
                } else {
                    toast.success('Mode Hors-ligne: Vente sauvegardée localement (En attente de sync)', { icon: '💾', duration: 5000 });
                }
            }

            return mapSaleRowToSale(savedSaleRow);
        },
        networkMode: 'always',
        onSuccess: (sale) => {
            console.log('[useSalesMutations] onSuccess called', sale.id);
            const isOptimistic = sale.id?.startsWith('sync_') || Boolean(sale.isOptimistic);

            if (!isOptimistic) {
                toast.success('Vente enregistrée');
            }

            if (broadcastService.isSupported() && !isOptimistic) {
                broadcastService.broadcast({ event: 'INSERT', table: 'sales', barId, data: sale });
                broadcastService.broadcast({ event: 'UPDATE', table: 'bar_products', barId });
            }

            queryClient.invalidateQueries({ queryKey: salesKeys.list(barId) });
            queryClient.invalidateQueries({ queryKey: stockKeys.products(barId) });
            queryClient.invalidateQueries({ queryKey: statsKeys.all(barId) });
        },
        onError: (error: unknown) => {
            console.error('[useSalesMutations] onError called', error);
            if (!isNetworkError(error)) {
                const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
                toast.error(`Erreur création: ${errorMessage}`);
            }
        }
    });

    const validateSale = useMutation({
        mutationFn: ({ id, validatorId }: { id: string; validatorId: string }) =>
            SalesService.validateSale(id, validatorId),
        onSuccess: (_data, variables) => {
            toast.success('Vente validée');
            if (broadcastService.isSupported()) {
                broadcastService.broadcast({ event: 'UPDATE', table: 'sales', barId, data: { id: variables.id, status: 'validated' } });
                broadcastService.broadcast({ event: 'UPDATE', table: 'bar_products', barId });
            }
            queryClient.invalidateQueries({ queryKey: salesKeys.list(barId) });
            queryClient.invalidateQueries({ queryKey: statsKeys.all(barId) });
        },
    });

    const rejectSale = useMutation({
        mutationFn: ({ id, rejectorId }: { id: string; rejectorId: string }) =>
            SalesService.rejectSale(id, rejectorId),
        onSuccess: (_data, variables) => {
            toast.success('Vente rejetée (stock restauré)');
            if (broadcastService.isSupported()) {
                broadcastService.broadcast({ event: 'UPDATE', table: 'sales', barId, data: { id: variables.id, status: 'rejected' } });
            }
            queryClient.invalidateQueries({ queryKey: salesKeys.list(barId) });
            queryClient.invalidateQueries({ queryKey: stockKeys.products(barId) });
            queryClient.invalidateQueries({ queryKey: statsKeys.all(barId) });
        },
    });

    const cancelSale = useMutation({
        mutationFn: ({ id, reason }: { id: string; reason: string }) =>
            SalesService.cancelSale(id, currentSession?.userId || '', reason),
        onSuccess: (_data, variables) => {
            toast.success('Vente annulée (Stock restauré)');
            if (broadcastService.isSupported()) {
                broadcastService.broadcast({ event: 'UPDATE', table: 'sales', barId, data: { id: variables.id, status: 'cancelled' } });
                broadcastService.broadcast({ event: 'UPDATE', table: 'bar_products', barId });
            }
            queryClient.invalidateQueries({ queryKey: salesKeys.list(barId) });
            queryClient.invalidateQueries({ queryKey: stockKeys.products(barId) });
            queryClient.invalidateQueries({ queryKey: statsKeys.all(barId) });
        },
    });

    const deleteSale = useMutation({
        mutationFn: SalesService.deleteSale,
        onSuccess: (_data, saleId) => {
            toast.success('Vente supprimée');
            if (broadcastService.isSupported()) {
                broadcastService.broadcast({ event: 'DELETE', table: 'sales', barId, data: { id: saleId } });
            }
            queryClient.invalidateQueries({ queryKey: salesKeys.list(barId) });
            queryClient.invalidateQueries({ queryKey: stockKeys.products(barId) });
            queryClient.invalidateQueries({ queryKey: statsKeys.all(barId) });
        },
    });

    return { createSale, validateSale, rejectSale, cancelSale, deleteSale };
};

const mapSaleRowToSale = (savedSaleRow: SaleRow): Sale => {
    // ✅ Type-safe row extension using explicit interface
    const rowExtended = savedSaleRow as SaleRowExtended;

    return {
        id: savedSaleRow.id,
        barId: savedSaleRow.bar_id,
        items: parseSaleItemsFromDb(savedSaleRow.items), // ✅ Validated items from DB
        total: savedSaleRow.total,
        currency: 'XOF',
        status: savedSaleRow.status as 'pending' | 'validated' | 'rejected' | 'cancelled',
        createdBy: savedSaleRow.created_by || savedSaleRow.sold_by || '',
        soldBy: savedSaleRow.sold_by || '',
        isOptimistic: rowExtended.isOptimistic,
        serverId: savedSaleRow.server_id || undefined,
        ticketId: rowExtended.ticket_id || undefined,
        validatedBy: savedSaleRow.validated_by || undefined,
        rejectedBy: savedSaleRow.rejected_by || undefined,
        createdAt: new Date(savedSaleRow.created_at || new Date().toISOString()),
        validatedAt: savedSaleRow.validated_at ? new Date(savedSaleRow.validated_at) : undefined,
        rejectedAt: savedSaleRow.status === 'rejected' && savedSaleRow.updated_at ? new Date(savedSaleRow.updated_at) : undefined,
        businessDate: savedSaleRow.business_date ? new Date(savedSaleRow.business_date) : new Date(),
        paymentMethod: savedSaleRow.payment_method as PaymentMethod,
        customerName: rowExtended.customer_name || undefined,
        customerPhone: rowExtended.customer_phone || undefined,
        notes: rowExtended.notes || undefined,
        sourceReturnId: rowExtended.source_return_id || undefined, // 🛡️ FIX P2: Magic Swap traçabilité
    };
};
