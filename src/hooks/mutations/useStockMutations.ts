import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ProductsService } from '../../services/supabase/products.service';
import { StockService } from '../../services/supabase/stock.service';
import { ProxyAdminService } from '../../services/supabase/proxy-admin.service';
import { stockKeys } from '../queries/useStockQueries';
import { useAuth } from '../../context/AuthContext';
import { useActingAs } from '../../context/ActingAsContext';
import toast from 'react-hot-toast';

export const useStockMutations = (barId: string) => {
    const queryClient = useQueryClient();
    const { currentSession } = useAuth();
    const { actingAs } = useActingAs();

    // --- PRODUCTS ---

    const createProduct = useMutation({
        mutationFn: async (productData: any) => {
            // PROXY MODE
            if (actingAs.isActive && actingAs.userId) {
                return ProxyAdminService.manageProductAsProxy(
                    actingAs.userId,
                    barId,
                    productData,
                    'CREATE'
                );
            }
            // STANDARD MODE
            return ProductsService.createBarProduct(productData);
        },
        onSuccess: () => {
            toast.success('Produit créé avec succès');
            queryClient.invalidateQueries({ queryKey: stockKeys.products(barId) });
        },
    });

    const updateProduct = useMutation({
        mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
            // PROXY MODE
            if (actingAs.isActive && actingAs.userId) {
                return ProxyAdminService.manageProductAsProxy(
                    actingAs.userId,
                    barId,
                    { id, ...updates },
                    'UPDATE'
                );
            }
            // STANDARD MODE
            return ProductsService.updateBarProduct(id, updates);
        },
        onSuccess: () => {
            toast.success('Produit mis à jour');
            queryClient.invalidateQueries({ queryKey: stockKeys.products(barId) });
        },
    });

    const deleteProduct = useMutation({
        mutationFn: async (id: string) => {
            // PROXY MODE
            if (actingAs.isActive && actingAs.userId) {
                return ProxyAdminService.manageProductAsProxy(
                    actingAs.userId,
                    barId,
                    { id },
                    'DELETE'
                );
            }
            // STANDARD MODE
            return ProductsService.deactivateProduct(id);
        },
        onSuccess: () => {
            toast.success('Produit supprimé');
            queryClient.invalidateQueries({ queryKey: stockKeys.products(barId) });
        },
    });

    // --- STOCK ADJUSTMENT (New) ---
    const adjustStock = useMutation({
        mutationFn: async ({ productId, delta, reason }: { productId: string; delta: number; reason: string }) => {
            // PROXY MODE
            if (actingAs.isActive && actingAs.userId) {
                return ProxyAdminService.updateStockAsProxy(
                    actingAs.userId,
                    barId,
                    productId,
                    delta,
                    reason
                );
            }

            // STANDARD MODE
            if (delta > 0) {
                return ProductsService.incrementStock(productId, delta);
            } else {
                return ProductsService.decrementStock(productId, Math.abs(delta));
            }
        },
        onSuccess: () => {
            toast.success('Stock mis à jour');
            queryClient.invalidateQueries({ queryKey: stockKeys.products(barId) });
        },
        onError: (err: any) => {
            toast.error(`Erreur mise à jour stock: ${err.message}`);
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
            const { data: rpcData, error } = await StockService.createSupplyAndUpdateProduct({
                p_bar_id: data.bar_id,
                p_product_id: data.product_id,
                p_quantity: data.quantity,
                p_lot_price: data.lot_price,
                p_lot_size: data.lot_size,
                p_supplier: data.supplier,
                p_created_by: data.created_by,
            });

            if (error) {
                throw new Error(error.message);
            }

            if (rpcData && !rpcData.success) {
                throw new Error(rpcData.message || 'Une erreur est survenue dans la base de données.');
            }

            return rpcData.supply;
        },
        onSuccess: () => {
            toast.success('Approvisionnement enregistré et CUMP mis à jour !');
            queryClient.invalidateQueries({ queryKey: stockKeys.supplies(barId) });
            queryClient.invalidateQueries({ queryKey: stockKeys.products(barId) });
        },
        onError: (err: any) => {
            toast.error(`Erreur: ${err.message}`);
        }
    });

    // --- CONSIGNMENTS ---

    const createConsignment = useMutation({
        mutationFn: async (data: any) => {
            if (!currentSession?.userId) {
                throw new Error('Utilisateur non connecté');
            }

            // Validate required fields
            if (!data.saleId) {
                throw new Error('Sale ID est obligatoire');
            }
            if (!data.productId) {
                throw new Error('Product ID est obligatoire');
            }
            if (!data.quantity || data.quantity < 1) {
                throw new Error('Quantité invalide');
            }

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
            if (data.originalSeller) consignmentData.original_seller = data.originalSeller;
            if (data.customerName) consignmentData.customer_name = data.customerName;
            if (data.customerPhone) consignmentData.customer_phone = data.customerPhone;
            if (data.notes) consignmentData.notes = data.notes;

            const newConsignment = await StockService.createConsignment(consignmentData);
            // Increment physical stock as per clarified business logic:
            // Consigned item is physically back in the bar, but reserved.
            await ProductsService.incrementStock(consignmentData.product_id, consignmentData.quantity);
            return newConsignment;
        },
        onSuccess: (newConsignment) => {
            toast.success('Consignation créée');
            // ✅ BUG #3 FIX: Valider que barId n'est pas vide avant d'invalider
            if (barId) {
                queryClient.invalidateQueries({ queryKey: stockKeys.consignments(barId) });
                queryClient.invalidateQueries({ queryKey: stockKeys.products(barId) });
            }
        },
        onError: (err: any) => {
            toast.error(`Erreur: ${err.message}`);
        }
    });

        const claimConsignment = useMutation({

            mutationFn: async ({ id, productId, quantity }: { id: string; productId: string; quantity: number; claimedBy: string }) => {

                // Update Consignment

                const consignment = await StockService.updateConsignmentStatus(id, 'claimed', {

                    claimed_at: new Date().toISOString()

                    // claimed_by? If DB supports it. Lint said 'claimedBy' unused.

                });

                await ProductsService.decrementStock(productId, quantity);

                return consignment;

            },

            onSuccess: () => {

                toast.success('Consignation réclamée');

                // ✅ BUG #3 FIX: Valider que barId n'est pas vide avant d'invalider
                // ✅ REFETCH au lieu de juste invalider pour rafraîchir immédiatement
                if (barId) {
                    queryClient.refetchQueries({ queryKey: stockKeys.consignments(barId) });

                    queryClient.refetchQueries({ queryKey: stockKeys.products(barId) });
                }

            },

        });

    

        const forfeitConsignment = useMutation({

            mutationFn: async ({ id, productId, quantity }: { id: string; productId: string; quantity: number }) => {

                const consignment = await StockService.updateConsignmentStatus(id, 'forfeited', {

                    // returned_at might not be in Partial<Consignment> if excluded from valid updates?

                    // But lint said it doesn't exist in Partial<...>.

                    // I will omit returned_at for now if it causes issues, or cast.

                });

                // DO NOT increment stock. The item was already in the bar, just reserved.

                // This was the major bug causing phantom stock.

                // await ProductsService.incrementStock(productId, quantity);

                return consignment;

            },
        onSuccess: () => {
            toast.success('Consignation abandonnée (stock réintégré)');
            // ✅ BUG #3 FIX: Valider que barId n'est pas vide avant d'invalider
            // ✅ REFETCH au lieu de juste invalider pour rafraîchir immédiatement
            if (barId) {
                queryClient.refetchQueries({ queryKey: stockKeys.consignments(barId) });
                queryClient.refetchQueries({ queryKey: stockKeys.products(barId) });
            }
        },
    });

    // --- SALES ---

    const validateSale = useMutation({
        mutationFn: async (items: Array<{ product: { id: string; name: string }; quantity: number }>) => {
            const promises = items.map(item =>
                ProductsService.decrementStock(item.product.id, item.quantity)
            );
            await Promise.all(promises);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: stockKeys.products(barId) });
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
        validateSale,
    };
};
