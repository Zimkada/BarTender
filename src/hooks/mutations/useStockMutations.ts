import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ProductsService } from '../../services/supabase/products.service';
import { StockService } from '../../services/supabase/stock.service';
import { stockKeys } from '../queries/useStockQueries';
import toast from 'react-hot-toast';

export const useStockMutations = (barId: string) => {
    const queryClient = useQueryClient();

    // --- PRODUCTS ---

    const createProduct = useMutation({
        mutationFn: ProductsService.createBarProduct,
        onSuccess: () => {
            toast.success('Produit créé avec succès');
            queryClient.invalidateQueries({ queryKey: stockKeys.products(barId) });
        },
    });

    const updateProduct = useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: any }) =>
            ProductsService.updateBarProduct(id, updates),
        onSuccess: () => {
            toast.success('Produit mis à jour');
            queryClient.invalidateQueries({ queryKey: stockKeys.products(barId) });
        },
    });

    const deleteProduct = useMutation({
        mutationFn: ProductsService.deactivateProduct,
        onSuccess: () => {
            toast.success('Produit supprimé');
            queryClient.invalidateQueries({ queryKey: stockKeys.products(barId) });
        },
    });

    // --- SUPPLIES (Complex Flow) ---

    const addSupply = useMutation({
        mutationFn: async (data: any) => {
            // Mapping App -> DB
            // data comes from useStockManagement.processSupply which passes:
            // { bar_id, product_id, quantity, lot_size, lot_price, total_cost, created_by, supplier }

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
            // Mapping App -> DB
            // data: { bar_id, product_id, quantity, client_name, client_phone, created_by, status, expires_at }

            // We need unit_price. We can fetch product or pass it. 
            // Assuming passed or we fetch. For now, let's assume 0 if not passed, or we should fetch product price.
            // Better: fetch product price here or ensure it's passed.
            // useStockManagement passes it? No. 
            // Let's fetch product to get price.
            const products = await ProductsService.getBarProducts(barId);
            const product = products.find(p => p.id === data.product_id);
            const unitPrice = product ? product.price : 0;

            const consignmentData = {
                bar_id: data.bar_id,
                product_id: data.product_id,
                quantity_out: data.quantity,
                quantity_returned: 0,
                unit_price: unitPrice,
                customer_name: data.client_name,
                customer_phone: data.client_phone,
                status: 'active' as const,
                consigned_by: data.created_by,
                consigned_at: new Date().toISOString(),
            };

            return StockService.createConsignment(consignmentData);
        },
        onSuccess: () => {
            toast.success('Consignation créée');
            queryClient.invalidateQueries({ queryKey: stockKeys.consignments(barId) });
        },
    });

    const claimConsignment = useMutation({
        mutationFn: async ({ id, productId, quantity, claimedBy }: { id: string; productId: string; quantity: number; claimedBy: string }) => {
            // 1. Mettre à jour le statut (Mapping: claimed -> sold)
            const consignment = await StockService.updateConsignmentStatus(id, 'sold', {
                returned_at: new Date().toISOString()
            });

            // 2. Déduire du stock physique (le produit part avec le client)
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
            // 1. Mettre à jour le statut (Mapping: forfeited -> returned)
            const consignment = await StockService.updateConsignmentStatus(id, 'returned', {
                returned_at: new Date().toISOString()
            });

            // 2. Réintégrer le stock (le produit revient dans le stock)
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
            // Note: Idéalement, cela devrait être une transaction RPC côté serveur
            // Pour l'instant, on boucle sur les items (risque de désynchronisation si échec partiel)
            const promises = items.map(item =>
                ProductsService.decrementStock(item.product.id, item.quantity)
            );

            await Promise.all(promises);
        },
        onSuccess: () => {
            // Pas de toast ici car géré par l'UI de vente généralement
            queryClient.invalidateQueries({ queryKey: stockKeys.products(barId) });
        },
    });

    return {
        createProduct,
        updateProduct,
        deleteProduct,
        addSupply,
        createConsignment,
        claimConsignment,
        forfeitConsignment,
        validateSale,
    };
};
