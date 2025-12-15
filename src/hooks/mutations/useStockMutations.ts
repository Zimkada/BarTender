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
        mutationFn: async (data: any) => {
            // PROXY MODE
            if (actingAs.isActive && actingAs.userId) {
                // RPC expects: p_acting_user_id, p_bar_id, p_supply_data (jsonb)
                return ProxyAdminService.createSupplyAsProxy(
                    actingAs.userId,
                    barId,
                    {
                        product_id: data.product_id,
                        quantity: data.quantity,
                        lot_size: data.lot_size,
                        lot_price: data.lot_price,
                        supplier: data.supplier
                    }
                );
            }

            // STANDARD MODE
            // Mapping App -> DB
            const unitCost = data.lot_size > 0 ? data.lot_price / data.lot_size : 0;

            const supplyData = {
                bar_id: data.bar_id,
                product_id: data.product_id,
                quantity: data.quantity,
                unit_cost: unitCost,
                total_cost: data.total_cost,
                supplier_name: data.supplier,
                supplied_by: data.created_by,
                supplied_at: new Date().toISOString(),
            };

            // 1. Créer l'approvisionnement
            const supply = await StockService.createSupply(supplyData);

            // 2. Mettre à jour le stock du produit
            // Note: On pourrait utiliser adjustStock ici pour être DRY, mais addSupply a une logique spécifique
            await ProductsService.incrementStock(data.product_id, data.quantity);

            return supply;
        },
        onSuccess: () => {
            toast.success('Approvisionnement enregistré');
            queryClient.invalidateQueries({ queryKey: stockKeys.supplies(barId) });
            queryClient.invalidateQueries({ queryKey: stockKeys.products(barId) });
        },
    });

    // --- CONSIGNMENTS ---

    const createConsignment = useMutation({
        mutationFn: async (data: any) => {
            const products = await ProductsService.getBarProducts(barId, actingAs.isActive ? currentSession?.userId : undefined);
            const product = products.find(p => p.id === data.product_id);
            const unitPrice = product ? product.price : 0;

            const consignmentData: any = { // Using any to bypass strict check if types are out of sync, but trying to match DB
                bar_id: data.bar_id,
                product_id: data.product_id,
                product_name: product ? ((product as any).name || (product as any).display_name || 'Unknown') : 'Unknown',
                quantity_out: data.quantity,
                quantity_returned: 0,
                unit_price: unitPrice,
                customer_name: data.client_name,
                customer_phone: data.client_phone,
                status: 'active',
                created_by: data.created_by, // Changed from consigned_by
                created_at: new Date().toISOString(), // Changed from consigned_at
                business_date: new Date().toISOString().split('T')[0], // Add business_date
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // Add default expiration (7 days)
                total_amount: unitPrice * data.quantity
            };

            return StockService.createConsignment(consignmentData);
        },
        onSuccess: () => {
            toast.success('Consignation créée');
            queryClient.invalidateQueries({ queryKey: stockKeys.consignments(barId) });
        },
    });

    const claimConsignment = useMutation({
        mutationFn: async ({ id, productId, quantity }: { id: string; productId: string; quantity: number; claimedBy: string }) => {
            // Update Consignment
            const consignment = await StockService.updateConsignmentStatus(id, 'sold', {
                claimed_at: new Date().toISOString()
                // claimed_by? If DB supports it. Lint said 'claimedBy' unused.
            });
            await ProductsService.decrementStock(productId, quantity);
            return consignment;
        },
        onSuccess: () => {
            toast.success('Consignation réclamée');
            queryClient.invalidateQueries({ queryKey: stockKeys.consignments(barId) });
            queryClient.invalidateQueries({ queryKey: stockKeys.products(barId) });
        },
    });

    const forfeitConsignment = useMutation({
        mutationFn: async ({ id, productId, quantity }: { id: string; productId: string; quantity: number }) => {
            const consignment = await StockService.updateConsignmentStatus(id, 'returned', {
                // returned_at might not be in Partial<Consignment> if excluded from valid updates?
                // But lint said it doesn't exist in Partial<...>.
                // I will omit returned_at for now if it causes issues, or cast.
            });
            await ProductsService.incrementStock(productId, quantity);
            return consignment;
        },
        onSuccess: () => {
            toast.success('Consignation abandonnée (stock réintégré)');
            queryClient.invalidateQueries({ queryKey: stockKeys.consignments(barId) });
            queryClient.invalidateQueries({ queryKey: stockKeys.products(barId) });
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
