import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ProductsService } from '../../services/supabase/products.service';
import { StockService } from '../../services/supabase/stock.service';
import { stockKeys } from '../queries/useStockQueries';
import { useAuth } from '../../context/AuthContext';
import { useBarContext } from '../../context/BarContext';
import { broadcastService } from '../../services/broadcast/BroadcastService';

// Helper: Centralized cache invalidation for stock queries
const invalidateStockQuery = (
    queryClient: ReturnType<typeof useQueryClient>,
    queryKey: readonly any[],
    barId: string
) => {
    queryClient.invalidateQueries({
        queryKey: queryKey as any[],
        exact: true
    });
};

export const useStockMutations = (barId?: string) => {
    const queryClient = useQueryClient();
    const { currentSession } = useAuth();
    const { currentBar } = useBarContext();
    const resolvedBarId = barId || currentBar?.id;

    // --- PRODUCTS ---

    const createProduct = useMutation({
        mutationFn: async (productData: any) => {
            const barId = currentBar?.id;
            if (!barId) throw new Error("No bar selected");
            return ProductsService.createBarProduct(productData);
        },
        onSuccess: () => {
            const barId = currentBar?.id;
            import('react-hot-toast').then(({ default: toast }) => {
                toast.success('Produit créé avec succès');
            });
            if (barId) {
                invalidateStockQuery(queryClient, stockKeys.products(barId), barId);
            }
        },
    });

    const updateProduct = useMutation({
        mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
            const barId = currentBar?.id;
            if (!barId) throw new Error("No bar selected");
            return ProductsService.updateBarProduct(id, updates);
        },
        onSuccess: (data, variables) => {
            const barId = currentBar?.id;
            import('react-hot-toast').then(({ default: toast }) => {
                toast.success('Produit mis à jour');
            });

            // 🚀 PHASE 3-4: Broadcast aux autres onglets
            if (barId && broadcastService.isSupported()) {
                broadcastService.broadcast({
                    event: 'UPDATE',
                    table: 'bar_products',
                    barId,
                    data: { id: variables.id, ...variables.updates },
                });
            }

            if (barId) {
                invalidateStockQuery(queryClient, stockKeys.products(barId), barId);
            }
        },
    });

    const deleteProduct = useMutation({
        mutationFn: async (id: string) => {
            const barId = currentBar?.id;
            if (!barId) throw new Error("No bar selected");
            return ProductsService.deactivateProduct(id);
        },
        onSuccess: (data, id) => {
            const barId = currentBar?.id;
            import('react-hot-toast').then(({ default: toast }) => {
                toast.success('Produit supprimé');
            });

            // 🚀 PHASE 3-4: Broadcast aux autres onglets
            if (barId && broadcastService.isSupported()) {
                broadcastService.broadcast({
                    event: 'DELETE',
                    table: 'bar_products',
                    barId,
                    data: { id },
                });
            }

            if (barId) {
                invalidateStockQuery(queryClient, stockKeys.products(barId), barId);
            }
        },
    });

    // --- STOCK ADJUSTMENT (New) ---
    const adjustStock = useMutation({
        mutationFn: async ({ productId, delta, reason }: { productId: string; delta: number; reason: string }) => {
            const barId = currentBar?.id;
            if (!barId) throw new Error("No bar selected");

            if (delta > 0) {
                return ProductsService.incrementStock(productId, delta);
            } else {
                return ProductsService.decrementStock(productId, Math.abs(delta));
            }
        },
        onSuccess: (data, variables) => {
            const barId = currentBar?.id;
            import('react-hot-toast').then(({ default: toast }) => {
                toast.success('Stock mis à jour');
            });

            // 🚀 PHASE 3-4: Broadcast aux autres onglets
            if (barId && broadcastService.isSupported()) {
                broadcastService.broadcast({
                    event: 'UPDATE',
                    table: 'bar_products',
                    barId,
                    data: { id: variables.productId, stockDelta: variables.delta },
                });
            }

            if (barId) {
                invalidateStockQuery(queryClient, stockKeys.products(barId), barId);
            }
        },
        onError: (err: any) => {
            import('react-hot-toast').then(({ default: toast }) => {
                toast.error(`Erreur mise à jour stock: ${err.message}`);
            });
        }
    });

    // --- SUPPLIES (Complex Flow) ---

    const addSupply = useMutation({
        mutationFn: async (data: {
            bar_id: string;
            product_id: string;
            quantity: number;
            lot_price: number;
            lot_size: number;
            supplier: string;
            created_by: string;
        }) => {
            const rpcData = await StockService.createSupplyAndUpdateProduct({
                p_bar_id: data.bar_id,
                p_product_id: data.product_id,
                p_quantity: data.quantity,
                p_lot_price: data.lot_price,
                p_lot_size: data.lot_size,
                p_supplier: data.supplier,
                p_created_by: data.created_by,
            });

            if (rpcData && !rpcData.success) {
                throw new Error(rpcData.message || 'Une erreur est survenue dans la base de données.');
            }

            return rpcData.supply;
        },
        onSuccess: (data, variables) => {
            const barId = currentBar?.id;
            import('react-hot-toast').then(({ default: toast }) => {
                toast.success('Approvisionnement enregistré et CUMP mis à jour !');
            });

            // 🚀 PHASE 3-4: Broadcast aux autres onglets
            if (barId && broadcastService.isSupported()) {
                broadcastService.broadcast({
                    event: 'INSERT',
                    table: 'supplies',
                    barId,
                    data: variables,
                });
                // Également broadcaster la mise à jour du produit (stock + CUMP)
                broadcastService.broadcast({
                    event: 'UPDATE',
                    table: 'bar_products',
                    barId,
                    data: { id: variables.product_id },
                });
            }

            if (barId) {
                invalidateStockQuery(queryClient, stockKeys.products(barId), barId);
                invalidateStockQuery(queryClient, stockKeys.supplies(barId), barId);
            }
        },
        onError: (err: any) => {
            import('react-hot-toast').then(({ default: toast }) => {
                toast.error(`Erreur: ${err.message}`);
            });
        }
    });

    // --- CONSIGNMENTS ---

    const createConsignment = useMutation({
        mutationFn: async (data: any) => {
            const barId = currentBar?.id;
            if (!currentSession?.userId || !barId) {
                throw new Error('Utilisateur non connecté ou bar non sélectionné');
            }

            // Validate required fields
            if (!data.saleId) throw new Error('Sale ID est obligatoire');
            if (!data.productId) throw new Error('Product ID est obligatoire');
            if (!data.quantity || data.quantity < 1) throw new Error('Quantité invalide');

            const consignmentData: any = {
                bar_id: barId,
                sale_id: data.saleId,
                product_id: data.productId,
                product_name: data.productName || 'Unknown',
                product_volume: data.productVolume || '',
                quantity: data.quantity,
                total_amount: data.totalAmount || 0,
                created_at: new Date().toISOString(),
                expires_at: data.expiresAt
                    ? (data.expiresAt instanceof Date ? data.expiresAt.toISOString() : data.expiresAt)
                    : new Date(Date.now() + (data.expirationDays || 7) * 24 * 60 * 60 * 1000).toISOString(),
                status: 'active',
                created_by: currentSession.userId,
            };

            // Add optional fields only if they have valid values
            if (data.serverId) consignmentData.server_id = data.serverId;
            if (data.originalSeller) consignmentData.original_seller = data.originalSeller;
            if (data.customerName) consignmentData.customer_name = data.customerName;
            if (data.customerPhone) consignmentData.customer_phone = data.customerPhone;
            if (data.notes) consignmentData.notes = data.notes;

            const newConsignment = await StockService.createConsignment(consignmentData);
            // Increment physical stock as per clarified business logic:
            await ProductsService.incrementStock(consignmentData.product_id, consignmentData.quantity);
            return newConsignment;
        },
        onSuccess: (newConsignment) => {
            const barId = currentBar?.id;
            import('react-hot-toast').then(({ default: toast }) => {
                toast.success('Consignation créée');
            });

            // 🚀 PHASE 3-4: Broadcast aux autres onglets
            if (barId && broadcastService.isSupported()) {
                broadcastService.broadcast({
                    event: 'INSERT',
                    table: 'consignments',
                    barId,
                    data: newConsignment,
                });
                // Notifier aussi le changement de stock (incrément)
                broadcastService.broadcast({
                    event: 'UPDATE',
                    table: 'bar_products',
                    barId,
                    data: { id: newConsignment.product_id },
                });
            }

            if (barId) {
                invalidateStockQuery(queryClient, stockKeys.consignments(barId), barId);
                invalidateStockQuery(queryClient, stockKeys.products(barId), barId);
            }
        },
        onError: (err: any) => {
            import('react-hot-toast').then(({ default: toast }) => {
                toast.error(`Erreur: ${err.message}`);
            });
        }
    });

    const claimConsignment = useMutation({
        mutationFn: async ({ id, productId, quantity }: { id: string; productId: string; quantity: number; claimedBy: string }) => {
            const consignment = await StockService.updateConsignmentStatus(id, 'claimed', {
                claimed_at: new Date().toISOString()
            });
            await ProductsService.decrementStock(productId, quantity);
            return consignment;
        },
        onSuccess: (consignment, variables) => {
            const barId = currentBar?.id;
            import('react-hot-toast').then(({ default: toast }) => {
                toast.success('Consignation réclamée');
            });

            // 🚀 PHASE 3-4: Broadcast aux autres onglets
            if (barId && broadcastService.isSupported()) {
                broadcastService.broadcast({
                    event: 'UPDATE',
                    table: 'consignments',
                    barId,
                    data: { id: variables.id, status: 'claimed' },
                });
                // Notifier aussi le changement de stock (décrément)
                broadcastService.broadcast({
                    event: 'UPDATE',
                    table: 'bar_products',
                    barId,
                    data: { id: variables.productId },
                });
            }

            if (barId) {
                invalidateStockQuery(queryClient, stockKeys.consignments(barId), barId);
                invalidateStockQuery(queryClient, stockKeys.products(barId), barId);
            }
        },
    });

    const forfeitConsignment = useMutation({
        mutationFn: async ({ id, productId, quantity }: { id: string; productId: string; quantity: number }) => {
            const consignment = await StockService.updateConsignmentStatus(id, 'forfeited', {});
            return consignment;
        },
        onSuccess: async () => {
            const barId = currentBar?.id;
            import('react-hot-toast').then(({ default: toast }) => {
                toast.success('Consignation abandonnée (stock réintégré)');
            });
            if (barId) {
                invalidateStockQuery(queryClient, stockKeys.consignments(barId), barId);
                invalidateStockQuery(queryClient, stockKeys.products(barId), barId);
            }
        },
    });

    const expireConsignments = useMutation({
        mutationFn: async (ids: string[]) => {
            const promises = ids.map(id => StockService.updateConsignmentStatus(id, 'expired', {}));
            return Promise.all(promises);
        },
        onSuccess: async (data) => {
            const barId = currentBar?.id;
            import('react-hot-toast').then(({ default: toast }) => {
                toast.success(`${data.length} consignation(s) marquée(s) comme expirée(s)`);
            });
            if (barId) {
                await queryClient.refetchQueries({ queryKey: stockKeys.consignments(barId) });
            }
        },
        onError: (err: any) => {
            import('react-hot-toast').then(({ default: toast }) => {
                toast.error(`Erreur lors de l'expiration: ${err.message}`);
            });
        }
    });

    // --- SALES ---

    const validateSale = useMutation({
        mutationFn: async ({ id, validatedBy }: { id: string, validatedBy: string }) => {
            const { SalesService } = await import('../../services/supabase/sales.service');
            return SalesService.validateSale(id, validatedBy);
        },
        onSuccess: (data, variables) => {
            const barId = currentBar?.id;
            import('react-hot-toast').then(({ default: toast }) => {
                toast.success('Vente validée et stock décrémenté');
            });

            // 🚀 PHASE 3-4: Broadcast aux autres onglets
            if (barId && broadcastService.isSupported()) {
                broadcastService.broadcast({
                    event: 'UPDATE',
                    table: 'bar_products',
                    barId,
                });
            }

            if (barId) {
                invalidateStockQuery(queryClient, stockKeys.products(barId), barId);
            }
        },
    });

    return {
        createProduct,
        updateProduct,
        deleteProduct,
        adjustStock, // ✅ EXPORTED
        addSupply,
        createConsignment,
        claimConsignment,
        forfeitConsignment,
        expireConsignments,
        validateSale,
    };
};
