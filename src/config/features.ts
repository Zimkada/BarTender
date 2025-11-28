/**
 * Feature Flags Configuration
 * Permet d'activer/désactiver des fonctionnalités en production sans redéploiement
 */

export const FEATURES = {
    /**
     * Système de promotions
     * Désactiver en cas de bug critique
     */
    PROMOTIONS_ENABLED: true,

    /**
     * Application automatique des promotions au panier
     * Si false, les promotions doivent être appliquées manuellement
     */
    PROMOTIONS_AUTO_APPLY: true,

    /**
     * Affichage des badges "PROMO" sur les produits
     */
    PROMOTIONS_SHOW_BADGES: true,

    /**
     * Validation côté serveur des promotions
     * IMPORTANT: Ne jamais désactiver en production
     */
    PROMOTIONS_SERVER_VALIDATION: true,

    /**
     * Logging détaillé des promotions
     * Activer pour debug, désactiver en production pour performance
     */
    PROMOTIONS_DEBUG_LOGGING: false,
} as const;

/**
 * Vérifier si une feature est activée
 */
export function isFeatureEnabled(feature: keyof typeof FEATURES): boolean {
    return FEATURES[feature];
}

/**
 * Type-safe feature check
 */
export type FeatureFlag = keyof typeof FEATURES;
