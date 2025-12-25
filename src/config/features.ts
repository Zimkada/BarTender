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

    /**
     * Mode Switching: Allow bars to switch between full and simplified modes
     * ✨ NOUVEAU (Phase 2)
     *
     * Default: false (OFF)
     * - Existing bars continue to work without changes
     * - New feature only enabled when explicitly activated
     * - Progressive rollout: 10% → 50% → 100% of bars
     *
     * When enabled:
     * - Bars can switch operating modes without losing data
     * - server_id field tracks servers across modes
     * - ServerMappingsManager UI available in settings
     */
    ENABLE_SWITCHING_MODE: true,

    /**
     * Advanced: Show mode switching UI in settings (only if ENABLE_SWITCHING_MODE is true)
     */
    SHOW_SWITCHING_MODE_UI: true,
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
