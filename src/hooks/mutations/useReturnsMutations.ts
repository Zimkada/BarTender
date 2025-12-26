import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ReturnsService } from '../../services/supabase/returns.service';
import { returnKeys } from '../queries/useReturnsQueries';
import { stockKeys } from '../queries/useStockQueries';
import { statsKeys } from '../queries/useStatsQueries';
import toast from 'react-hot-toast';

export const useReturnsMutations = (barId: string) => {
    const queryClient = useQueryClient();

    const createReturn = useMutation({
        mutationFn: async (data: any) => {
            const returnData = {
                bar_id: data.barId,
                sale_id: data.saleId,
                product_id: data.productId,
                product_name: data.productName,
                product_volume: data.productVolume,
                quantity_sold: data.quantitySold,
                quantity_returned: data.quantityReturned,
                reason: data.reason,
                returned_by: data.returnedBy,
                server_id: data.server_id || null,
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
                operating_mode_at_creation: data.operatingModeAtCreation || 'full',
            };
            return ReturnsService.createReturn(returnData);
        },
        onSuccess: (newReturn) => {
            toast.success('Retour enregistré');
            queryClient.invalidateQueries({ queryKey: returnKeys.list(barId) });
            // Invalider aussi le CA si le retour est remboursé
            if (newReturn.is_refunded) {
                queryClient.invalidateQueries({ queryKey: statsKeys.all(barId) });
            }
        },
        onError: (error: any) => {
            const errorMessage = error?.message || 'Erreur lors de la création du retour';
            console.error('createReturn error:', error);
            toast.error(errorMessage);
        },
    });

    const updateReturn = useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: any }) =>
            ReturnsService.updateReturn(id, updates),
        onSuccess: (updatedReturn) => {
            toast.success('Retour mis à jour');
            queryClient.invalidateQueries({ queryKey: returnKeys.list(barId) });
            // Invalider stats/CA si le statut change ou si c'est un remboursement
            if (updatedReturn.is_refunded || updatedReturn.status === 'restocked') {
                queryClient.invalidateQueries({ queryKey: statsKeys.all(barId) });
                queryClient.invalidateQueries({ queryKey: stockKeys.products(barId) });
            }
        },
        onError: (error: any) => {
            const errorMessage = error?.message || 'Erreur lors de la mise à jour du retour';
            console.error('updateReturn error:', error);
            toast.error(errorMessage);
        },
    });

    const deleteReturn = useMutation({
        mutationFn: ReturnsService.deleteReturn,
        onSuccess: () => {
            toast.success('Retour supprimé');
            queryClient.invalidateQueries({ queryKey: returnKeys.list(barId) });
            // Invalider aussi les stats au cas où le retour était remboursé
            queryClient.invalidateQueries({ queryKey: statsKeys.all(barId) });
        },
        onError: (error: any) => {
            const errorMessage = error?.message || 'Erreur lors de la suppression du retour';
            console.error('deleteReturn error:', error);
            toast.error(errorMessage);
        },
    });

    return {
        createReturn,
        updateReturn,
        deleteReturn,
    };
};
