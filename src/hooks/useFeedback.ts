// hooks/useFeedback.ts
import { useNotifications } from '../components/Notifications';
import { useState } from 'react';

export const useFeedback = () => {
  const { showNotification } = useNotifications();
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});

  const showSuccess = (message: string, duration?: number) => {
    showNotification('success', message, { duration });
  };

  const showError = (message: string) => {
    showNotification('error', message);
  };

  const showInfo = (message: string) => {
    showNotification('info', message);
  };

  const setLoading = (key: string, loading: boolean) => {
    setLoadingStates(prev => ({ ...prev, [key]: loading }));
  };

  const isLoading = (key: string) => loadingStates[key] || false;

  // Feedback pour actions courantes
  const feedbackActions = {
    // Produits
    productAdded: () => showSuccess('✅ Produit ajouté avec succès !'),
    productUpdated: () => showSuccess('✏️ Produit modifié avec succès !'),
    productDeleted: () => showSuccess('🗑️ Produit supprimé'),

    // Commandes
    orderCreated: (tableNumber?: string) =>
      showSuccess(`🍽️ Commande lancée${tableNumber ? ` pour ${tableNumber}` : ''} !`),
    orderCompleted: () => showSuccess('✅ Commande terminée !'),

    // Inventaire
    stockUpdated: () => showSuccess('📦 Stock mis à jour'),
    lowStockAlert: (product: string) =>
      showNotification('error', `⚠️ Stock faible pour ${product}`),

    // Erreurs courantes
    networkError: () => showError('❌ Erreur de connexion'),
    validationError: (field: string) => showError(`❌ ${field} est requis`),

    // Actions spécifiques au bar
    cartCleared: () => showInfo('🧹 Panier vidé'),
    itemAddedToCart: (product: string) => showSuccess(`➕ ${product} ajouté au panier`, 1000),
  };

  return {
    showSuccess,
    showError,
    showInfo,
    setLoading,
    isLoading,
    ...feedbackActions
  };
};