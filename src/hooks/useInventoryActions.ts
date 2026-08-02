import { useState } from 'react';
import { Product } from '../types';
import { useStockAdjustment } from './mutations/useStockAdjustment';
import { useFeedback } from './useFeedback';
import { useAuth } from '../context/AuthContext';
import { useBarContext } from '../context/BarContext';
import { getErrorMessage } from '../utils/errorHandler';
import { useStock } from '../context/hooks/useStock';
import { useStockMutations } from './mutations/useStockMutations';

export function useInventoryActions() {
    const { currentBar } = useBarContext();
    const { currentSession, hasPermission } = useAuth();
    const { showSuccess, showError } = useFeedback();

    const { addProduct, updateProduct, deleteProduct } = useStock();
    const { addSupply } = useStockMutations(currentBar?.id || '');

    const stockAdjustmentMutation = useStockAdjustment();

    // Modal States
    const [showProductModal, setShowProductModal] = useState(false);
    const [showStockAdjustmentModal, setShowStockAdjustmentModal] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | undefined>();
    const [adjustingProduct, setAdjustingProduct] = useState<Product | undefined>();
    const [productToDelete, setProductToDelete] = useState<Product | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Handlers
    const handleAddProduct = () => {
        setEditingProduct(undefined);
        setShowProductModal(true);
    };

    const handleEditProduct = (product: Product) => {
        setEditingProduct(product);
        setShowProductModal(true);
    };

    const handleSaveProduct = async (data: Omit<Product, 'id' | 'createdAt' | 'barId'>) => {
        try {
            if (editingProduct) {
                await updateProduct(editingProduct.id, { ...data, barId: editingProduct.barId });
                showSuccess('Produit mis à jour');
            } else {
                await addProduct({ ...data, barId: currentBar?.id || '' });
                showSuccess('Produit ajouté');
            }
            setShowProductModal(false);
            setEditingProduct(undefined);
        } catch (error) {
            console.error('Error saving product', error);
            // L'erreur est déjà affichée via toast.error dans useStockMutations
            throw error; // Re-throw pour que le composant modal sache que l'opération a échoué
        }
    };

    const handleAdjustStock = (product: Product) => {
        setAdjustingProduct(product);
        setShowStockAdjustmentModal(true);
    };

    const handleAdjustmentSubmit = async (adjustmentData: {
        productId: string;
        delta: number;
        reason: string;
        notes?: string;
    }) => {
        if (!adjustingProduct || !currentBar || !currentSession) return;

        try {
            await stockAdjustmentMutation.mutateAsync({
                productId: adjustmentData.productId,
                productName: adjustingProduct.name,
                oldStock: adjustingProduct.stock,
                newStock: adjustingProduct.stock + adjustmentData.delta,
                delta: adjustmentData.delta,
                reason: adjustmentData.reason,
                notes: adjustmentData.notes,
                barId: currentBar.id,
                // userId, userName, userRole, barName are now resolved server-side
            });
            showSuccess('Stock ajusté avec succès');
            setShowStockAdjustmentModal(false);
            setAdjustingProduct(undefined);
        } catch (error) {
            console.error('Erreur ajustement stock:', getErrorMessage(error));
            showError('Erreur lors de l\'ajustement');
        }
    };

    const handleDeleteClick = (product: Product) => {
        // 🛡️ Piloté par PERMISSION, jamais par rôle brut.
        //
        // ⭐ ARBITRAGE MÉTIER (02/08/2026) : le gérant assure la gestion
        // quotidienne du bar, il DOIT pouvoir retirer un produit du catalogue.
        //
        // L'ancien garde bloquait les gérants au motif d'un « risque de perte
        // d'historique ». Vérification faite, ce motif était FACTUELLEMENT FAUX :
        // `deleteProduct` appelle `ProductsService.deactivateProduct`, un SOFT
        // DELETE (`is_active: false`). Aucune ligne n'est effacée, les ventes
        // passées restent intactes. Le blocage protégeait donc contre un risque
        // qui n'existait pas.
        if (!hasPermission('canDeleteProducts')) {
            showError("Action Refusée : votre rôle ne permet pas de retirer un produit du catalogue.");
            return;
        }
        setProductToDelete(product);
    };

    const handleDeleteConfirm = async () => {
        if (!productToDelete) return;
        setIsDeleting(true);
        try {
            await deleteProduct(productToDelete.id);
            showSuccess('Produit supprimé');
            setProductToDelete(null);
        } catch (error) {
            console.error('Erreur suppression:', error);
            showError('Erreur lors de la suppression');
        } finally {
            setIsDeleting(false);
        }
    };

    const handleSupply = async (supplyData: {
        productId: string;
        quantity: number;
        lotSize: number;
        lotPrice: number;
        supplier: string;
    }) => {
        if (!currentBar || !currentSession) return;

        try {
            await addSupply.mutateAsync({
                bar_id: currentBar.id,
                product_id: supplyData.productId,
                quantity: supplyData.quantity,
                lot_price: supplyData.lotPrice,
                lot_size: supplyData.lotSize,
                supplier: supplyData.supplier,
                created_by: currentSession.userId,
            });
            showSuccess('Approvisionnement effectué avec succès');
        } catch (error) {
            console.error('Erreur approvisionnement:', error);
            showError('Erreur lors de l\'approvisionnement');
        }
    };

    return {
        // States
        showProductModal,
        setShowProductModal,
        showStockAdjustmentModal,
        setShowStockAdjustmentModal,
        editingProduct,
        setEditingProduct,
        adjustingProduct,
        setAdjustingProduct,
        productToDelete,
        setProductToDelete,
        isDeleting,

        // Actions
        handleAddProduct,
        handleEditProduct,
        handleSaveProduct,
        handleAdjustStock,
        handleAdjustmentSubmit,
        handleDeleteClick,
        handleDeleteConfirm,
        handleSupply
    };
}
