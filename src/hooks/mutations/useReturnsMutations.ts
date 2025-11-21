import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ReturnsService } from '../../services/supabase/returns.service';
import { returnKeys } from '../queries/useReturnsQueries';
import toast from 'react-hot-toast';

export const useReturnsMutations = (barId: string) => {
    const queryClient = useQueryClient();

    const createReturn = useMutation({
        mutationFn: async (data: any) => {
            const returnData = {
                bar_id: data.barId,
                sale_id: data.saleId,
                product_id: data.productId,
                quantity: data.quantity,
                reason: data.reason,
                returned_by: data.returnedBy,
                returned_at: new Date().toISOString(),
            };
            return ReturnsService.createReturn(returnData);
        },
        onSuccess: () => {
            toast.success('Retour enregistré');
            queryClient.invalidateQueries({ queryKey: returnKeys.list(barId) });
        },
    });

    const updateReturn = useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: any }) =>
            ReturnsService.updateReturn(id, updates),
        onSuccess: () => {
            toast.success('Retour mis à jour');
            queryClient.invalidateQueries({ queryKey: returnKeys.list(barId) });
        },
    });

    const deleteReturn = useMutation({
        mutationFn: ReturnsService.deleteReturn,
        onSuccess: () => {
            toast.success('Retour supprimé');
            queryClient.invalidateQueries({ queryKey: returnKeys.list(barId) });
        },
    });

    return {
        createReturn,
        updateReturn,
        deleteReturn,
    };
};
