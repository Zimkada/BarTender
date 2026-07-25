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

    /**
     * Paiement d'abonnement via checkout FedaPay (Mobile Money hébergé).
     *
     * ACTIF EN PRODUCTION depuis le 2026-07-25 : compte FedaPay Live (Travailleur
     * Indépendant), secrets Live posés, flux validé de bout en bout avec un vrai
     * paiement (checkout -> webhook signé -> crédit d'abonnement OK). Affiché aux
     * côtés du paiement MoMo direct dans la section "Mon abonnement".
     *
     * ⚠️ Limite du compte Indépendant : 10 transactions/semaine (Elysée FedaPay,
     * 24/07). Le MoMo direct sert de soupape si un bar dépasse ce plafond. Passer
     * au compte Business (RCCM requis) lèvera cette limite quand le volume l'exigera.
     */
    FEDAPAY_CHECKOUT_ENABLED: true,
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
