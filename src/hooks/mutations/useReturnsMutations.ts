import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ReturnsService } from '../../services/supabase/returns.service';
import { returnKeys } from '../queries/useReturnsQueries';
import { stockKeys } from '../queries/useStockQueries';
import { statsKeys } from '../queries/useStatsQueries';
import { broadcastService } from '../../services/broadcast/BroadcastService';
import { getCurrentBusinessDateString } from '../../utils/businessDateHelpers';
import { BUSINESS_DAY_CLOSE_HOUR } from '../../constants/businessDay';
import { getErrorMessage } from '../../utils/errorHandler';
import type { Return } from '../../types';

// Input shape for createReturn mutation (camelCase from domain, plus extra fields)
type CreateReturnInput = Partial<Return> & {
    barId: string;
    returnedBy: string;
    server_id?: string;
    businessDate?: string;
};

export const useReturnsMutations = (barId: string) => {
    const queryClient = useQueryClient();

    const createReturn = useMutation({
        mutationFn: async (data: CreateReturnInput) => {
            console.log('[useReturnsMutations] preparing return data:', data);
            const returnData = {
                bar_id: data.barId,
                sale_id: data.saleId ?? '',
                product_id: data.productId ?? '',
                product_name: data.productName ?? '',
                product_volume: data.productVolume ?? null,
                quantity_sold: data.quantitySold ?? 0,
                quantity_returned: data.quantityReturned ?? 0,
                reason: data.reason ?? 'other',
                returned_by: data.returnedBy,
                server_id: data.serverId || data.server_id || null,
                returned_at: data.returnedAt instanceof Date
                    ? data.returnedAt.toISOString()
                    : (data.returnedAt || new Date().toISOString()),
                refund_amount: data.refundAmount || 0,
                is_refunded: data.isRefunded || false,
                status: data.status || 'pending',
                auto_restock: data.autoRestock || false,
                manual_restock_required: data.manualRestockRequired || false,
                notes: data.notes || null,
                custom_refund: data.customRefund || null,
                custom_restock: data.customRestock || null,
                original_seller: data.originalSeller || null,
                // ✨ MODE SWITCHING SUPPORT: Store operating mode at creation
                operating_mode_at_creation: data.operatingModeAtCreation || 'simplified',
                business_date: data.businessDate || getCurrentBusinessDateString(BUSINESS_DAY_CLOSE_HOUR),
                ...(data.id ? { id: data.id } : {}), // ✨ Support ID pré-généré pour le Magic Swap
            };
            console.log('[useReturnsMutations] calling ReturnsService.createReturn with:', returnData);
            return ReturnsService.createReturn(returnData as Parameters<typeof ReturnsService.createReturn>[0]);
        },
        onSuccess: (newReturn) => {
            console.log('[useReturnsMutations] creation SUCCESS:', newReturn);
            import('react-hot-toast').then(({ default: toast }) => {
                toast.success('Retour enregistré');
            });

            // 🚀 Broadcast to other tabs/devices for instant sync
            if (broadcastService.isSupported()) {
                broadcastService.broadcast({
                    event: 'INSERT',
                    table: 'returns',
                    barId,
                    data: newReturn
                });
            }

            queryClient.invalidateQueries({ queryKey: returnKeys.list(barId) });
            // Invalider le stock si le retour est remis en stock automatiquement
            if (newReturn.auto_restock) {
                queryClient.invalidateQueries({ queryKey: stockKeys.products(barId) });
            }
            // Invalider aussi le CA si le retour est remboursé
            if (newReturn.is_refunded) {
                queryClient.invalidateQueries({ queryKey: statsKeys.all(barId) });
            }
        },
        onError: (error) => {
            console.error('[useReturnsMutations] creation ERROR:', error);
            const errorMessage = getErrorMessage(error) || 'Erreur lors de la création du retour';
            import('react-hot-toast').then(({ default: toast }) => {
                toast.error(errorMessage);
            });
        },
    });

    const updateReturn = useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: Partial<Return> }) =>
            // Cast needed: ReturnsService.updateReturn accepts DB shape, we pass domain shape
            ReturnsService.updateReturn(id, updates as Parameters<typeof ReturnsService.updateReturn>[1]),
        onSuccess: (updatedReturn) => {
            import('react-hot-toast').then(({ default: toast }) => {
                toast.success('Retour mis à jour');
            });

            // 🚀 Broadcast to other tabs/devices for instant sync
            if (broadcastService.isSupported()) {
                broadcastService.broadcast({
                    event: 'UPDATE',
                    table: 'returns',
                    barId,
                    data: updatedReturn
                });
                // Also broadcast stock update if restocked
                if (updatedReturn.status === 'restocked') {
                    broadcastService.broadcast({
                        event: 'UPDATE',
                        table: 'bar_products',
                        barId
                    });
                }
            }

            queryClient.invalidateQueries({ queryKey: returnKeys.list(barId) });
            // Invalider stats/CA si le statut change ou si c'est un remboursement
            if (updatedReturn.is_refunded || updatedReturn.status === 'restocked') {
                queryClient.invalidateQueries({ queryKey: statsKeys.all(barId) });
                queryClient.invalidateQueries({ queryKey: stockKeys.products(barId) });
            }
        },
        onError: (error) => {
            const errorMessage = getErrorMessage(error) || 'Erreur lors de la mise à jour du retour';
            console.error('updateReturn error:', error);
            import('react-hot-toast').then(({ default: toast }) => {
                toast.error(errorMessage);
            });
        },
    });

    const deleteReturn = useMutation({
        mutationFn: ReturnsService.deleteReturn,
        onSuccess: (_data, returnId) => {
            import('react-hot-toast').then(({ default: toast }) => {
                toast.success('Retour supprimé');
            });

            // 🚀 Broadcast to other tabs/devices for instant sync
            if (broadcastService.isSupported()) {
                broadcastService.broadcast({
                    event: 'DELETE',
                    table: 'returns',
                    barId,
                    data: { id: returnId }
                });
            }

            queryClient.invalidateQueries({ queryKey: returnKeys.list(barId) });
            // Invalider aussi les stats au cas où le retour était remboursé
            queryClient.invalidateQueries({ queryKey: statsKeys.all(barId) });
        },
        onError: (error) => {
            const errorMessage = getErrorMessage(error) || 'Erreur lors de la suppression du retour';
            console.error('deleteReturn error:', error);
            import('react-hot-toast').then(({ default: toast }) => {
                toast.error(errorMessage);
            });
        },
    });

    return {
        createReturn,
        updateReturn,
        deleteReturn,
    };
};
