import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SalesService } from '../../services/supabase/sales.service';
import { salesKeys } from '../queries/useSalesQueries';
import { stockKeys } from '../queries/useStockQueries';
import { statsKeys } from '../queries/useStatsQueries';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { useBarContext } from '../../context/BarContext';
import { calculateBusinessDate, dateToYYYYMMDD } from '../../utils/businessDateHelpers';
import { BUSINESS_DAY_CLOSE_HOUR } from '../../config/constants';
import type { Sale } from '../../types';

export const useSalesMutations = (barId: string) => {
    const queryClient = useQueryClient();
    const { currentSession } = useAuth();
    const { currentBar } = useBarContext();

    const createSale = useMutation({
        mutationFn: async (saleData: Omit<Sale, 'id' | 'createdAt' | 'businessDate'>) => {
            
            // ✅ OFFLINE-FIRST: Calculer la businessDate côté client
            const closeHour = currentBar?.closingHour ?? BUSINESS_DAY_CLOSE_HOUR;
            const businessDate = calculateBusinessDate(new Date(), closeHour);

            const createSaleData = {
                bar_id: barId,
                items: saleData.items.map((item: any) => ({
                    product_id: item.product_id || item.productId,
                    product_name: item.product_name || item.productName,
                    quantity: item.quantity,
                    unit_price: item.unit_price || item.unitPrice,
                    total_price: item.total_price || item.totalPrice,
                    original_unit_price: item.original_unit_price || item.originalUnitPrice,
                    discount_amount: item.discount_amount || item.discountAmount,
                    promotion_id: item.promotion_id || item.promotionId,
                    promotion_name: item.promotion_name || item.promotionName
                })),
                payment_method: saleData.paymentMethod || 'cash',
                sold_by: currentSession?.userId || '',
                customer_name: saleData.customerName,
                customer_phone: saleData.customerPhone,
                notes: saleData.notes,
                status: saleData.status,
                // ✅ Envoyer la date calculée au backend
                business_date: dateToYYYYMMDD(businessDate)
            };

            if (!createSaleData.sold_by) {
                throw new Error('Utilisateur non connecté');
            }

            // Le service appelle la fonction RPC qui accepte maintenant p_business_date
            const savedSaleRow = await SalesService.createSale(createSaleData as any);

            // Le mapping ici est pour la cohérence du type, mais la DB retourne déjà le bon objet
            const savedSale: Sale = {
                id: savedSaleRow.id,
                barId: savedSaleRow.bar_id,
                items: savedSaleRow.items as any[],
                total: savedSaleRow.total,
                currency: 'XOF',
                status: savedSaleRow.status as 'pending' | 'validated' | 'rejected',
                createdBy: savedSaleRow.sold_by,
                validatedBy: savedSaleRow.validated_by || undefined,
                rejectedBy: savedSaleRow.rejected_by || undefined,
                createdAt: new Date(savedSaleRow.created_at || new Date().toISOString()),
                validatedAt: savedSaleRow.validated_at ? new Date(savedSaleRow.validated_at) : undefined,
                rejectedAt: savedSaleRow.status === 'rejected' && savedSaleRow.updated_at ? new Date(savedSaleRow.updated_at) : undefined,
                businessDate: new Date(savedSaleRow.business_date),
                paymentMethod: savedSaleRow.payment_method as any,
                customerName: savedSaleRow.customer_name || undefined,
                customerPhone: savedSaleRow.customer_phone || undefined,
                notes: savedSaleRow.notes || undefined
            };

            return savedSale;
        },
        onSuccess: () => {
            toast.success('Vente enregistrée');
            queryClient.invalidateQueries({ queryKey: salesKeys.list(barId) });
            queryClient.invalidateQueries({ queryKey: stockKeys.products(barId) });
            queryClient.invalidateQueries({ queryKey: statsKeys.all(barId) });
        },
        onError: (error: any) => {
            toast.error(`Erreur lors de la vente: ${error.message}`);
        }
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
