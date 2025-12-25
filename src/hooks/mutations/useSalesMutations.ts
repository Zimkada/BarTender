import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SalesService } from '../../services/supabase/sales.service';
import { ProxyAdminService } from '../../services/supabase/proxy-admin.service';
import { salesKeys } from '../queries/useSalesQueries';
import { stockKeys } from '../queries/useStockQueries';
import { statsKeys } from '../queries/useStatsQueries';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { useBarContext } from '../../context/BarContext';
import { useActingAs } from '../../context/ActingAsContext';
import { calculateBusinessDate, dateToYYYYMMDD } from '../../utils/businessDateHelpers';
import { BUSINESS_DAY_CLOSE_HOUR } from '../../config/constants';
import type { Sale } from '../../types';

export const useSalesMutations = (barId: string) => {
    const queryClient = useQueryClient();
    const { currentSession } = useAuth();
    const { currentBar } = useBarContext();
    const { isActingAs, actingAs } = useActingAs();

    const createSale = useMutation({
        mutationFn: async (saleData: Omit<Sale, 'id' | 'createdAt' | 'businessDate'>) => {

            // ✅ OFFLINE-FIRST: Calculer la businessDate côté client
            const closeHour = currentBar?.closingHour ?? BUSINESS_DAY_CLOSE_HOUR;
            const businessDate = calculateBusinessDate(new Date(), closeHour);
            const formattedBusinessDate = dateToYYYYMMDD(businessDate);

            // Préparer les données communes
            const itemsFormatted = saleData.items.map((item: any) => ({
                product_id: item.product_id || item.productId,
                product_name: item.product_name || item.productName,
                quantity: item.quantity,
                unit_price: item.unit_price || item.unitPrice,
                total_price: item.total_price || item.totalPrice,
                original_unit_price: item.original_unit_price || item.originalUnitPrice,
                discount_amount: item.discount_amount || item.discountAmount,
                promotion_id: item.promotion_id || item.promotionId,
                promotion_name: item.promotion_name || item.promotionName
            }));

            // 🌟 MODE PROXY: Si on agit en tant qu'un autre utilisateur
            if (isActingAs() && actingAs.userId) {
                const proxySaleData = {
                    items: itemsFormatted,
                    payment_method: saleData.paymentMethod || 'cash',
                    status: saleData.status,
                    server_id: saleData.serverId || null,  // ✨ NOUVEAU: Pass server_id for simplified mode
                    customer_name: saleData.customerName,
                    customer_phone: saleData.customerPhone,
                    notes: saleData.notes,
                    business_date: formattedBusinessDate
                };

                const savedSaleRow = await ProxyAdminService.createSaleAsProxy(
                    actingAs.userId,
                    barId,
                    proxySaleData
                );

                // Mapping du retour (identique à standard)
                return mapSaleRowToSale(savedSaleRow);
            }

            // 🚀 MODE STANDARD
            const createSaleData = {
                bar_id: barId,
                items: itemsFormatted,
                payment_method: saleData.paymentMethod || 'cash',
                sold_by: currentSession?.userId || '',
                server_id: saleData.serverId || null,  // ✨ NOUVEAU: Pass server_id for simplified mode
                customer_name: saleData.customerName,
                customer_phone: saleData.customerPhone,
                notes: saleData.notes,
                status: saleData.status,
                business_date: formattedBusinessDate
            };

            if (!createSaleData.sold_by) {
                throw new Error('Utilisateur non connecté');
            }

            const savedSaleRow = await SalesService.createSale(createSaleData as any);
            return mapSaleRowToSale(savedSaleRow);
        },
        onSuccess: () => {
            toast.success('Vente enregistrée');
            queryClient.invalidateQueries({ queryKey: salesKeys.list(barId) });
            queryClient.invalidateQueries({ queryKey: stockKeys.products(barId) });
            queryClient.invalidateQueries({ queryKey: statsKeys.all(barId) });
        },
        onError: (error: any) => {
            console.error(error);
            toast.error(`Erreur lors de la vente: ${error.message}`);
        }
    });

    const validateSale = useMutation({
        mutationFn: ({ id, validatorId }: { id: string; validatorId: string }) =>
            SalesService.validateSale(id, validatorId),
        onSuccess: () => {
            toast.success('Vente validée');
            queryClient.invalidateQueries({ queryKey: salesKeys.list(barId) });
            queryClient.invalidateQueries({ queryKey: statsKeys.all(barId) }); // NEW: Invalidate stats
        },
    });

    const rejectSale = useMutation({
        mutationFn: ({ id, rejectorId }: { id: string; rejectorId: string }) =>
            SalesService.rejectSale(id, rejectorId),
        onSuccess: () => {
            toast.success('Vente rejetée (stock restauré)');
            queryClient.invalidateQueries({ queryKey: salesKeys.list(barId) });
            queryClient.invalidateQueries({ queryKey: stockKeys.products(barId) });
            queryClient.invalidateQueries({ queryKey: statsKeys.all(barId) }); // NEW: Invalidate stats
        },
    });

    const deleteSale = useMutation({
        mutationFn: SalesService.deleteSale,
        onSuccess: () => {
            toast.success('Vente supprimée');
            queryClient.invalidateQueries({ queryKey: salesKeys.list(barId) });
            queryClient.invalidateQueries({ queryKey: stockKeys.products(barId) });
            queryClient.invalidateQueries({ queryKey: statsKeys.all(barId) }); // NEW: Invalidate stats
        },
    });

    return {
        createSale,
        validateSale,
        rejectSale,
        deleteSale,
    };
};

// Helper pour éviter la duplication du mapping
const mapSaleRowToSale = (savedSaleRow: any): Sale => {
    return {
        id: savedSaleRow.id,
        barId: savedSaleRow.bar_id,
        items: savedSaleRow.items as any[],
        total: savedSaleRow.total,
        currency: 'XOF',
        status: savedSaleRow.status as 'pending' | 'validated' | 'rejected',
        createdBy: savedSaleRow.created_by || savedSaleRow.sold_by, // Fallback
        serverId: savedSaleRow.server_id || undefined,  // ✨ NOUVEAU: Include serverId from DB
        validatedBy: savedSaleRow.validated_by || undefined,
        rejectedBy: savedSaleRow.rejected_by || undefined,
        createdAt: new Date(savedSaleRow.created_at || new Date().toISOString()),
        validatedAt: savedSaleRow.validated_at ? new Date(savedSaleRow.validated_at) : undefined,
        rejectedAt: savedSaleRow.status === 'rejected' && savedSaleRow.updated_at ? new Date(savedSaleRow.updated_at) : undefined,
        businessDate: savedSaleRow.business_date ? new Date(savedSaleRow.business_date) : new Date(),
        paymentMethod: savedSaleRow.payment_method as any,
        customerName: savedSaleRow.customer_name || undefined,
        customerPhone: savedSaleRow.customer_phone || undefined,
        notes: savedSaleRow.notes || undefined
    };
};
