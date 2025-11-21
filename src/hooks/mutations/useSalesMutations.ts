import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SalesService } from '../../services/supabase/sales.service';
import { salesKeys } from '../queries/useSalesQueries';
import { stockKeys } from '../queries/useStockQueries';
import toast from 'react-hot-toast';

export const useSalesMutations = (barId: string) => {
    const queryClient = useQueryClient();

    const createSale = useMutation({
        mutationFn: SalesService.createSale,
        onSuccess: () => {
            toast.success('Vente enregistrée');
            queryClient.invalidateQueries({ queryKey: salesKeys.list(barId) });
            queryClient.invalidateQueries({ queryKey: stockKeys.products(barId) }); // Stock impacté
        },
    });

    const validateSale = useMutation({
        mutationFn: ({ id, validatorId }: { id: string; validatorId: string }) =>
            SalesService.validateSale(id, validatorId),
        onSuccess: () => {
            toast.success('Vente validée');
            queryClient.invalidateQueries({ queryKey: salesKeys.list(barId) });
        },
    });

    const rejectSale = useMutation({
        mutationFn: ({ id, rejectorId }: { id: string; rejectorId: string }) =>
            SalesService.rejectSale(id, rejectorId),
        onSuccess: () => {
            toast.success('Vente rejetée (stock restauré)');
            queryClient.invalidateQueries({ queryKey: salesKeys.list(barId) });
            queryClient.invalidateQueries({ queryKey: stockKeys.products(barId) });
        },
    });

    const deleteSale = useMutation({
        mutationFn: SalesService.deleteSale,
        onSuccess: () => {
            toast.success('Vente supprimée');
            queryClient.invalidateQueries({ queryKey: salesKeys.list(barId) });
            queryClient.invalidateQueries({ queryKey: stockKeys.products(barId) });
        },
    });

    return {
        createSale,
        validateSale,
        rejectSale,
        deleteSale,
    };
};
