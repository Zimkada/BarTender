import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ProductsService } from '../../services/supabase/products.service';
import { StockService } from '../../services/supabase/stock.service';
import { ProxyAdminService } from '../../services/supabase/proxy-admin.service';
import { stockKeys } from '../queries/useStockQueries';
import { useAuth } from '../../context/AuthContext';
import { useActingAs } from '../../context/ActingAsContext';
import { useBarContext } from '../../context/BarContext';
import toast from 'react-hot-toast';

// Helper: Centralized cache invalidation for stock queries
const invalidateStockQuery = (
    queryClient: ReturnType<typeof useQueryClient>,
    queryKey: readonly any[],
    barId: string,
    actingAs: { isActive: boolean; userId?: string }
) => {
    const proxySuffix = actingAs.isActive ? `proxy:${actingAs.userId}` : 'standard';
    queryClient.invalidateQueries({
        queryKey: [...queryKey, proxySuffix],
        exact: true
    });
};

export const useStockMutations = () => {
    const queryClient = useQueryClient();
    const { currentSession } = useAuth();
    const { actingAs } = useActingAs();
    const { currentBar } = useBarContext();

    // --- PRODUCTS ---

    const createProduct = useMutation({
        mutationFn: async (productData: any) => {
            const barId = currentBar?.id;
            if (!barId) throw new Error("No bar selected");
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
            const barId = currentBar?.id;
            toast.success('Produit créé avec succès');
            if (barId) {
                invalidateStockQuery(queryClient, stockKeys.products(barId), barId, actingAs);
            }
        },
    });

    const updateProduct = useMutation({
        mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
            const barId = currentBar?.id;
            if (!barId) throw new Error("No bar selected");
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
            const barId = currentBar?.id;
            toast.success('Produit mis à jour');
            if (barId) {
                invalidateStockQuery(queryClient, stockKeys.products(barId), barId, actingAs);
            }
        },
    });

    const deleteProduct = useMutation({
        mutationFn: async (id: string) => {
            const barId = currentBar?.id;
            if (!barId) throw new Error("No bar selected");
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
            const barId = currentBar?.id;
            toast.success('Produit supprimé');
            if (barId) {
                invalidateStockQuery(queryClient, stockKeys.products(barId), barId, actingAs);
            }
        },
    });

    // --- STOCK ADJUSTMENT (New) ---
    const adjustStock = useMutation({
        mutationFn: async ({ productId, delta, reason }: { productId: string; delta: number; reason: string }) => {
            const barId = currentBar?.id;
            if (!barId) throw new Error("No bar selected");
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
            const barId = currentBar?.id;
            toast.success('Stock mis à jour');
            if (barId) {
                invalidateStockQuery(queryClient, stockKeys.products(barId), barId, actingAs);
            }
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
            const barId = currentBar?.id;
            toast.success('Approvisionnement enregistré et CUMP mis à jour !');
            if (barId) {
                invalidateStockQuery(queryClient, stockKeys.products(barId), barId, actingAs);
                invalidateStockQuery(queryClient, stockKeys.supplies(barId), barId, actingAs);
            }
        },
        onError: (err: any) => {
            toast.error(`Erreur: ${err.message}`);
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
            toast.success('Consignation créée');
            if (barId) {
                invalidateStockQuery(queryClient, stockKeys.consignments(barId), barId, actingAs);
                invalidateStockQuery(queryClient, stockKeys.products(barId), barId, actingAs);
            }
        },
        onError: (err: any) => {
            toast.error(`Erreur: ${err.message}`);
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
        onSuccess: async () => {
            const barId = currentBar?.id;
            toast.success('Consignation réclamée');
            if (barId) {
                invalidateStockQuery(queryClient, stockKeys.consignments(barId), barId, actingAs);
                invalidateStockQuery(queryClient, stockKeys.products(barId), barId, actingAs);
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
            toast.success('Consignation abandonnée (stock réintégré)');
            if (barId) {
                invalidateStockQuery(queryClient, stockKeys.consignments(barId), barId, actingAs);
                invalidateStockQuery(queryClient, stockKeys.products(barId), barId, actingAs);
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
            toast.success(`${data.length} consignation(s) marquée(s) comme expirée(s)`);
            if (barId) {
                await queryClient.refetchQueries({ queryKey: stockKeys.consignments(barId) });
            }
        },
        onError: (err: any) => {
            toast.error(`Erreur lors de l'expiration: ${err.message}`);
        }
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
            const barId = currentBar?.id;
            if (barId) {
                invalidateStockQuery(queryClient, stockKeys.products(barId), barId, actingAs);
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
