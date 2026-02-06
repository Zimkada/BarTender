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

type SaleRow = Database['public']['Tables']['sales']['Row'];

export const useSalesMutations = (barId: string) => {
    const queryClient = useQueryClient();
    const { currentSession } = useAuth();
    const { currentBar, isSimplifiedMode } = useBarContext();

    const isNetworkError = (error: unknown): boolean => {
        if (!(error instanceof Error)) return !navigator.onLine;
        return (
            !navigator.onLine ||
            error.message === 'Failed to fetch' ||
            error.message.includes('NetworkError') ||
            error.message.includes('connection') ||
            error.message.includes('Internet') ||
            (error as any).code === 'PGRST000'
        );
    };

    const createSale = useMutation<Sale, unknown, Partial<Sale> & { items: SaleItem[] }, unknown>({
        mutationFn: async (saleData: Partial<Sale> & { items: SaleItem[] }) => {
            console.log('[useSalesMutations] mutationFn triggered', saleData);

            // 1. Préparer les données
            const closeHour = currentBar?.closingHour ?? BUSINESS_DAY_CLOSE_HOUR;
            const businessDate = calculateBusinessDate(new Date(), closeHour);
            const formattedBusinessDate = dateToYYYYMMDD(businessDate);

            const itemsFormatted = saleData.items.map((item: any) => ({
                product_id: item.product_id || item.productId,
                product_name: item.product_name || item.productName,
                quantity: item.quantity,
                unit_price: item.unit_price || item.unitPrice,
                total_price: item.total_price || item.totalPrice,
                original_unit_price: item.original_unit_price || item.originalUnitPrice,
                discount_amount: item.discount_amount || item.discountAmount,
                promotion_id: item.promotion_id || item.promotionId,
                promotion_type: item.promotion_type || item.promotionType,
                promotion_name: item.promotion_name || item.promotionName
            }));

            const soldByValue = isSimplifiedMode && saleData.serverId
                ? saleData.serverId
                : (currentSession?.userId || '');

            const validatedByValue = isSimplifiedMode && saleData.status === 'validated'
                ? (currentSession?.userId || null)
                : null;

            const salePayload: any = {
                bar_id: barId,
                items: itemsFormatted,
                payment_method: saleData.ticketId ? 'ticket' : (saleData.paymentMethod || 'cash'),
                sold_by: soldByValue,
                server_id: saleData.serverId || null,
                ticket_id: saleData.ticketId || null,
                validated_by: validatedByValue,
                status: saleData.status || 'pending',
                customer_name: (saleData as any).customerName,
                customer_phone: (saleData as any).customerPhone,
                notes: (saleData as any).notes,
                business_date: formattedBusinessDate,
            };

            console.log('[useSalesMutations] payload prepared', salePayload);

            if (!salePayload.sold_by) {
                console.error('[useSalesMutations] No user ID found for sale');
                throw new Error('Utilisateur non connecté');
            }

            const role = currentSession?.role;
            const canWorkOffline = !!role;

            const safetyTimeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('GLOBAL_MUTATION_TIMEOUT')), 15000)
            );

            console.log('[useSalesMutations] calling SalesService.createSale with 15s safety race', { canWorkOffline });

            const savedSaleRow = await Promise.race([
                SalesService.createSale(
                    salePayload,
                    {
                        canWorkOffline,
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
            if (!('isOptimistic' in sale && (sale as any).isOptimistic)) {
                toast.success('Vente enregistrée');
            }

            if (broadcastService.isSupported() && !('isOptimistic' in sale && sale.isOptimistic)) {
                broadcastService.broadcast({ event: 'INSERT', table: 'sales', barId, data: sale });
                broadcastService.broadcast({ event: 'UPDATE', table: 'bar_products', barId });
            }

            queryClient.invalidateQueries({ queryKey: salesKeys.list(barId) });
            queryClient.invalidateQueries({ queryKey: stockKeys.products(barId) });
            queryClient.invalidateQueries({ queryKey: statsKeys.all(barId) });
        },
        onError: (error: any) => {
            console.error('[useSalesMutations] onError called', error);
            if (!isNetworkError(error)) {
                toast.error(`Erreur création: ${error.message || 'Erreur inconnue'}`);
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
    return {
        id: savedSaleRow.id,
        barId: savedSaleRow.bar_id,
        items: (savedSaleRow.items as any) as SaleItem[],
        total: savedSaleRow.total,
        currency: 'XOF',
        status: savedSaleRow.status as any,
        createdBy: savedSaleRow.created_by || savedSaleRow.sold_by || '',
        soldBy: savedSaleRow.sold_by || '',
        isOptimistic: (savedSaleRow as any).isOptimistic,
        serverId: savedSaleRow.server_id || undefined,
        ticketId: (savedSaleRow as any).ticket_id || undefined,
        validatedBy: savedSaleRow.validated_by || undefined,
        rejectedBy: savedSaleRow.rejected_by || undefined,
        createdAt: new Date(savedSaleRow.created_at || new Date().toISOString()),
        validatedAt: savedSaleRow.validated_at ? new Date(savedSaleRow.validated_at) : undefined,
        rejectedAt: savedSaleRow.status === 'rejected' && savedSaleRow.updated_at ? new Date(savedSaleRow.updated_at) : undefined,
        businessDate: savedSaleRow.business_date ? new Date(savedSaleRow.business_date) : new Date(),
        paymentMethod: savedSaleRow.payment_method as PaymentMethod,
        customerName: (savedSaleRow as any).customer_name || undefined,
        customerPhone: (savedSaleRow as any).customer_phone || undefined,
        notes: (savedSaleRow as any).notes || undefined
    };
};
