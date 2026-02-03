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

type OptimisticSale = Sale & { isOptimistic: true };
type SaleRow = Database['public']['Tables']['sales']['Row'];

export const useSalesMutations = (barId: string) => {
    const queryClient = useQueryClient();
    const { currentSession } = useAuth();
    const { currentBar, isSimplifiedMode } = useBarContext();

    // 🔄 Helper pour détecter si c'est une erreur réseau (offline)
    const isNetworkError = (error: unknown): boolean => {
        // Type guard: vérifier que c'est un Error object avant d'accéder à .message
        if (!(error instanceof Error)) {
            return !navigator.onLine; // Fallback: assume network error si offline
        }

        // Maintenant safe d'accéder à .message
        return (
            !navigator.onLine ||
            error.message === 'Failed to fetch' ||
            error.message.includes('NetworkError') ||
            error.message.includes('connection') ||
            error.message.includes('Internet') ||
            (error as any).code === 'PGRST000' // PostgREST connection error
        );
    };

    /**
     * 🟢 CREATE SALE (Optimistic Offline)
     * Tente la création online. Si fail -> Queue offline + Retourne un succès simulé.
     */

    const createSale = useMutation<Sale, unknown, Partial<Sale> & { items: SaleItem[] }, unknown>({
        mutationFn: async (saleData: Partial<Sale> & { items: SaleItem[] }) => {
            // Import dymanique pour éviter cycle (si nécessaire)
            const { syncQueue } = await import('../../services/SyncQueue');

            // 1. Préparer les données
            const closeHour = currentBar?.closingHour ?? BUSINESS_DAY_CLOSE_HOUR;
            const businessDate = calculateBusinessDate(new Date(), closeHour);
            const formattedBusinessDate = dateToYYYYMMDD(businessDate);

            // Formatage des items commun
            const itemsFormatted = saleData.items.map((item: SaleItem) => ({
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

            // 2. Construire le Payload complet (Compatible Supabase RPC)
            // ✨ MODE SWITCHING FIX: sold_by doit être le serveur, pas le gérant/promoteur
            // En mode simplifié: sold_by = serverId (qui a reçu le crédit)
            // En mode complet: sold_by = currentSession.userId (qui a créé)
            const soldByValue = isSimplifiedMode && saleData.serverId
                ? saleData.serverId
                : (currentSession?.userId || '');

            // ✨ CORRECTION VALIDATED_BY: En mode simplifié, le gérant qui crée est le validateur
            // En mode complet, validated_by sera NULL (sera renseigné lors de la validation manuelle)
            const validatedByValue = isSimplifiedMode && saleData.status === 'validated'
                ? (currentSession?.userId || null)
                : null;

            const salePayload: Database['public']['Tables']['sales']['Insert'] = {
                bar_id: barId,
                items: itemsFormatted,
                payment_method: saleData.paymentMethod || 'cash',
                sold_by: soldByValue,
                server_id: saleData.serverId || null,
                validated_by: validatedByValue, // ✨ NOUVEAU: Gérant connecté en mode simplifié
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

                const savedSaleRow = await SalesService.createSale(salePayload);
                return mapSaleRowToSale(savedSaleRow);

            } catch (error: unknown) {
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
                    import('react-hot-toast').then(({ default: toast }) => {
                        toast.success('Mode Hors-ligne: Vente sauvegardée localement', { icon: '💾' });
                    });

                    return {
                        id: `temp_${Date.now()}`, // ID temporaire
                        ...saleData,
                        createdAt: new Date(),
                        businessDate: businessDate,
                        status: 'pending', // Sera validée après sync
                        total: saleData.items.reduce((sum, item: SaleItem) => sum + (item.total_price || item.totalPrice || 0), 0),
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
            if (!('isOptimistic' in sale && sale.isOptimistic)) {
                import('react-hot-toast').then(({ default: toast }) => {
                    toast.success('Vente enregistrée');
                });
            }

            // 🚀 PHASE 3-4: Broadcast aux autres onglets (sync instant 0ms)
            if (broadcastService.isSupported() && !('isOptimistic' in sale && sale.isOptimistic)) {
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
        onError: (error: unknown) => {
            // Ne pas afficher d'erreur si c'est une erreur réseau (offline géré)
            if (!isNetworkError(error)) {
                import('react-hot-toast').then(({ default: toast }) => {
                    toast.error(`Erreur lors de la création de la vente: ${error.message}`);
                });
            }
        }
    });

    const validateSale = useMutation({
        mutationFn: ({ id, validatorId }: { id: string; validatorId: string }) =>
            SalesService.validateSale(id, validatorId),
        onSuccess: (_data, variables) => {
            import('react-hot-toast').then(({ default: toast }) => {
                toast.success('Vente validée');
            });

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
        onSuccess: (_data, variables) => {
            import('react-hot-toast').then(({ default: toast }) => {
                toast.success('Vente rejetée (stock restauré)');
            });

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

    // Removed duplicate cancelSale declaration

    const cancelSale = useMutation({
        mutationFn: ({ id, reason }: { id: string; reason: string }) =>
            SalesService.cancelSale(id, currentSession?.userId || '', reason),
        onSuccess: (_data, variables) => {
            import('react-hot-toast').then(({ default: toast }) => {
                toast.success('Vente annulée (Stock restauré)');
            });

            if (broadcastService.isSupported()) {
                broadcastService.broadcast({
                    event: 'UPDATE',
                    table: 'sales',
                    barId,
                    data: { id: variables.id, status: 'cancelled' },
                });
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
    });

    const deleteSale = useMutation({
        mutationFn: SalesService.deleteSale,
        onSuccess: (_data, saleId) => {
            import('react-hot-toast').then(({ default: toast }) => {
                toast.success('Vente supprimée');
            });

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
        cancelSale,
        deleteSale,
    };
};

// Helper pour éviter la duplication du mapping
const mapSaleRowToSale = (savedSaleRow: SaleRow): Sale => {
    return {
        id: savedSaleRow.id,
        barId: savedSaleRow.bar_id,
        items: savedSaleRow.items as SaleItem[],
        total: savedSaleRow.total,
        currency: 'XOF',
        status: savedSaleRow.status as 'pending' | 'validated' | 'rejected' | 'cancelled',
        createdBy: savedSaleRow.created_by || savedSaleRow.sold_by, // Fallback
        soldBy: savedSaleRow.sold_by || undefined,  // ✨ CRUCIAL: Include soldBy from DB (attribution métier)
        serverId: savedSaleRow.server_id || undefined,  // ✨ NOUVEAU: Include serverId from DB
        validatedBy: savedSaleRow.validated_by || undefined,
        rejectedBy: savedSaleRow.rejected_by || undefined,
        createdAt: new Date(savedSaleRow.created_at || new Date().toISOString()),
        validatedAt: savedSaleRow.validated_at ? new Date(savedSaleRow.validated_at) : undefined,
        rejectedAt: savedSaleRow.status === 'rejected' && savedSaleRow.updated_at ? new Date(savedSaleRow.updated_at) : undefined,
        businessDate: savedSaleRow.business_date ? new Date(savedSaleRow.business_date) : new Date(),
        paymentMethod: savedSaleRow.payment_method as PaymentMethod, // Assuming PaymentMethod is defined
        customerName: savedSaleRow.customer_name || undefined,
        customerPhone: savedSaleRow.customer_phone || undefined,
        notes: savedSaleRow.notes || undefined
    };
};
