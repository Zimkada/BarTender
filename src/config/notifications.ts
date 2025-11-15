/**
 * Configuration for notification system
 * Optimized for fast sales workflow
 */

export const NOTIFICATION_DURATION = {
  QUICK: 1000,     // 1s - For quick sales (minimal distraction)
  NORMAL: 3000,    // 3s - For standard operations
  IMPORTANT: 5000, // 5s - For errors and important alerts
} as const;

export const NOTIFICATION_MESSAGES = {
  // Quick sale messages (ultra-short)
  SALE_SUCCESS: '✓',
  SALE_VALIDATED: '✓',

  // Standard messages
  PRODUCT_ADDED: 'Produit ajouté',
  PRODUCT_UPDATED: 'Produit modifié',
  PRODUCT_DELETED: 'Produit supprimé',

  // Error messages
  SALE_ERROR: '⚠️ Erreur lors de la vente',
  VALIDATION_ERROR: '⚠️ Veuillez vérifier les données',
} as const;
