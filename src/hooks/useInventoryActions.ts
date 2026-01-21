import { useState } from 'react';
import { Product } from '../types';
import { useStockManagement } from './useStockManagement';
import { useStockAdjustment } from './mutations/useStockAdjustment';
import { useFeedback } from './useFeedback';
import { useAuth } from '../context/AuthContext';
import { useBarContext } from '../context/BarContext';
import { useAppContext } from '../context/AppContext';

export function useInventoryActions() {
    const { addProduct, updateProduct, deleteProduct, processSupply } = useStockManagement();
    const stockAdjustmentMutation = useStockAdjustment();
    const { showSuccess, showError } = useFeedback();
    const { currentBar } = useBarContext();
    const { currentSession } = useAuth();
    const { addExpense } = useAppContext();

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

    const handleSaveProduct = async (data: any) => {
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
            showError('Erreur lors de la sauvegarde');
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
                barName: currentBar.name,
                userId: currentSession.userId,
                userName: currentSession.userName,
                userRole: currentSession.role
            });
            showSuccess('Stock ajusté avec succès');
            setShowStockAdjustmentModal(false);
            setAdjustingProduct(undefined);
        } catch (error: any) {
            console.error('Erreur ajustement stock:', error);
            showError('Erreur lors de l\'ajustement');
        }
    };

    const handleDeleteClick = (product: Product) => {
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
        try {
            await processSupply(supplyData, (expenseData) => {
                addExpense(expenseData);
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
