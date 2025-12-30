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
import { broadcastService } from '../../services/broadcast/BroadcastService';

export const useSalesMutations = (barId: string) => {
    const queryClient = useQueryClient();
    const { currentSession } = useAuth();
    const { currentBar } = useBarContext();
    const { isActingAs, actingAs } = useActingAs();

    // 🔄 Helper pour détecter si c'est une erreur réseau (offline)
    const isNetworkError = (error: any): boolean => {
        return (
            !navigator.onLine ||
            error.message === 'Failed to fetch' ||
            error.message.includes('NetworkError') ||
            error.message.includes('connection') ||
            error.message.includes('Internet') ||
            error.code === 'PGRST000' // PostgREST connection error
        );
    };

    /**
     * 🟢 CREATE SALE (Optimistic Offline)
     * Tente la création online. Si fail -> Queue offline + Retourne un succès simulé.
     */

    const createSale = useMutation({
        mutationFn: async (saleData: Omit<Sale, 'id' | 'createdAt' | 'businessDate'>) => {
            // Import dymanique pour éviter cycle (si nécessaire)
            const { syncQueue } = await import('../../services/SyncQueue');

            // 1. Préparer les données
            const closeHour = currentBar?.closingHour ?? BUSINESS_DAY_CLOSE_HOUR;
            const businessDate = calculateBusinessDate(new Date(), closeHour);
            const formattedBusinessDate = dateToYYYYMMDD(businessDate);

            // Formatage des items commun
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

            // 2. Construire le Payload complet (Compatible Supabase RPC)
            const salePayload = {
                bar_id: barId,
                items: itemsFormatted,
                payment_method: saleData.paymentMethod || 'cash',
                sold_by: isActingAs() && actingAs.userId ? actingAs.userId : (currentSession?.userId || ''),
                server_id: saleData.serverId || null,
                status: saleData.status || 'pending', // Pending par défaut si offline
                customer_name: saleData.customerName,
                customer_phone: saleData.customerPhone,
                notes: saleData.notes,
                business_date: formattedBusinessDate,
                // Metadata contextuelles pour la sync offline
                created_at_local: new Date().toISOString()
            };

            if (!salePayload.sold_by) throw new Error('Utilisateur non connecté');

            // 3. Tenter l'envoi ONLINE
            try {
                // Vérif primitive d'abord
                if (!navigator.onLine) throw new Error('Offline');

                let savedSaleRow;

                // Branchement Proxy vs Standard
                if (isActingAs() && actingAs.userId) {
                    savedSaleRow = await ProxyAdminService.createSaleAsProxy(
                        actingAs.userId,
                        barId,
                        salePayload
                    );
                } else {
                    savedSaleRow = await SalesService.createSale(salePayload as any);
                }

                return mapSaleRowToSale(savedSaleRow);

            } catch (error: any) {
                // 4. Fallback OFFLINE
                if (isNetworkError(error)) {
                    console.log('🌐 Mode Offline détecté, mise en queue...', error);

                    // Enqueue dans SyncQueue
                    syncQueue.enqueue(
                        'CREATE_SALE',
                        salePayload,
                        barId,
                        currentSession?.userId || 'offline-user'
                    );

                    // Retourner une "Optimistic Sale" pour l'UI
                    toast.success('Mode Hors-ligne: Vente sauvegardée localement', { icon: '💾' });

                    return {
                        id: `temp_${Date.now()}`, // ID temporaire
                        ...saleData,
                        createdAt: new Date(),
                        businessDate: businessDate,
                        status: 'pending', // Sera validée après sync
                        total: saleData.items.reduce((sum, item: any) => sum + (item.total_price || item.totalPrice || 0), 0),
                        currency: 'XOF',
                        createdBy: salePayload.sold_by,
                        isOptimistic: true // UI flag
                    } as unknown as Sale;
                }

                // Si c'est une vraie erreur (validation, etc.), on la remonte
                throw error;
            }
        },
        onSuccess: (sale) => {
            // Ne pas afficher de toast si c'est une vente optimiste (offline)
            // Le toast est déjà affiché dans le mutationFn
            if (!(sale as any).isOptimistic) {
                toast.success('Vente enregistrée');
            }

            // 🚀 PHASE 3-4: Broadcast aux autres onglets (sync instant 0ms)
            if (broadcastService.isSupported() && !(sale as any).isOptimistic) {
                broadcastService.broadcast({
                    event: 'INSERT',
                    table: 'sales',
                    barId,
                    data: sale,
                });
                // 🚀 FIX: Broadcaster aussi le changement de stock
                broadcastService.broadcast({
                    event: 'UPDATE',
                    table: 'bar_products',
                    barId,
                });
            }

            queryClient.invalidateQueries({ queryKey: salesKeys.list(barId) });
            queryClient.invalidateQueries({ queryKey: stockKeys.products(barId) });
            queryClient.invalidateQueries({ queryKey: statsKeys.all(barId) });
        },
        onError: (error: any) => {
            // Ne pas afficher d'erreur si c'est une erreur réseau (offline géré)
            if (!isNetworkError(error)) {
                toast.error(`Erreur lors de la création de la vente: ${error.message}`);
            }
        }
    });

    const validateSale = useMutation({
        mutationFn: ({ id, validatorId }: { id: string; validatorId: string }) =>
            SalesService.validateSale(id, validatorId),
        onSuccess: (data, variables) => {
            toast.success('Vente validée');

            // 🚀 PHASE 3-4: Broadcast aux autres onglets
            if (broadcastService.isSupported()) {
                broadcastService.broadcast({
                    event: 'UPDATE',
                    table: 'sales',
                    barId,
                    data: { id: variables.id, status: 'validated' },
                });
                // 🚀 FIX: Broadcaster aussi le changement de stock (décrément effectif)
                broadcastService.broadcast({
                    event: 'UPDATE',
                    table: 'bar_products',
                    barId,
                });
            }

            queryClient.invalidateQueries({ queryKey: salesKeys.list(barId) });
            queryClient.invalidateQueries({ queryKey: statsKeys.all(barId) }); // NEW: Invalidate stats
        },
    });

    const rejectSale = useMutation({
        mutationFn: ({ id, rejectorId }: { id: string; rejectorId: string }) =>
            SalesService.rejectSale(id, rejectorId),
        onSuccess: (data, variables) => {
            toast.success('Vente rejetée (stock restauré)');

            // 🚀 PHASE 3-4: Broadcast aux autres onglets
            if (broadcastService.isSupported()) {
                broadcastService.broadcast({
                    event: 'UPDATE',
                    table: 'sales',
                    barId,
                    data: { id: variables.id, status: 'rejected' },
                });
            }

            queryClient.invalidateQueries({ queryKey: salesKeys.list(barId) });
            queryClient.invalidateQueries({ queryKey: stockKeys.products(barId) });
            queryClient.invalidateQueries({ queryKey: statsKeys.all(barId) }); // NEW: Invalidate stats
        },
    });

    const deleteSale = useMutation({
        mutationFn: SalesService.deleteSale,
        onSuccess: (data, saleId) => {
            toast.success('Vente supprimée');

            // 🚀 PHASE 3-4: Broadcast aux autres onglets
            if (broadcastService.isSupported()) {
                broadcastService.broadcast({
                    event: 'DELETE',
                    table: 'sales',
                    barId,
                    data: { id: saleId },
                });
            }

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
