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
     * Default: false (OFF) — tant que le compte marchand FedaPay n'est pas actif
     * ET que les Edge Functions ne sont pas déployées, on n'affiche PAS le bouton
     * "Payer par Mobile Money" (il échouerait). Le paiement MoMo direct (numéros +
     * motif affichés) reste le canal disponible au démarrage.
     *
     * Flux validé de bout en bout en SANDBOX le 2026-07-17 (checkout + webhook +
     * crédit d'abonnement OK). Reste à false tant que les secrets Supabase sont
     * sandbox : passer à true UNIQUEMENT après bascule des clés FedaPay en LIVE
     * (sinon les vrais bars paieraient vers l'environnement de test).
     */
    FEDAPAY_CHECKOUT_ENABLED: false,
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
