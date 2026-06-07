/**
 * plans.ts — Définition centralisée des plans d'utilisation BarTender
 *
 * Chaque bar a un plan assigné par le SuperAdmin dans bars.settings.plan.
 *
 * SEGMENTATION : par taille d'équipe uniquement (promoteur inclus dans le compteur).
 * - Toutes les fonctionnalités sont incluses dans tous les plans (anti-dette technique,
 *   anti-lock-in, conformité légale SYSCOHADA).
 * - La PlanId 'enterprise' reste la clé technique pour stabilité (label affiché : "Max").
 *
 * Pricing (cf. MARKETING.md §4) :
 * - Starter 9 000 XOF/mois (300 FCFA/jour) — sas commercial, force upsell au 4ᵉ membre
 * - Pro 15 000 XOF/mois (500 FCFA/jour) — tier vedette ICP, force upsell au 9ᵉ membre
 * - Max 30 000 XOF/mois (1 000 FCFA/jour) — gros bars, limite dure (custom au-delà)
 */

// =====================================================
// TYPES
// =====================================================

export type PlanId = 'starter' | 'pro' | 'enterprise';

export interface PlanFeatures {
  accounting: boolean;
  exports: boolean;
  promotions: boolean;
  forecasting: boolean;
}

export interface PlanDefinition {
  id: PlanId;
  label: string;
  description: string;
  maxMembers: number;
  /** Prix mensuel en XOF (FCFA) — montant attendu de l'abonnement */
  monthlyPriceXOF: number;
  dataTier: 'lite' | 'balanced' | 'enterprise';
  features: PlanFeatures;
}

export type FeatureKey = keyof PlanFeatures;

// =====================================================
// PLANS
// =====================================================

const ALL_FEATURES_ENABLED: PlanFeatures = {
  accounting: true,
  exports: true,
  promotions: true,
  forecasting: true,
};

export const PLANS: Record<PlanId, PlanDefinition> = {
  starter: {
    id: 'starter',
    label: 'Starter',
    description: 'Bar qui démarre — équipe jusqu\'à 3 personnes (promoteur inclus)',
    maxMembers: 3,
    monthlyPriceXOF: 9000,
    dataTier: 'balanced',
    features: ALL_FEATURES_ENABLED,
  },
  pro: {
    id: 'pro',
    label: 'Pro',
    description: 'Bar actif — équipe jusqu\'à 8 personnes (promoteur inclus)',
    maxMembers: 8,
    monthlyPriceXOF: 15000,
    dataTier: 'balanced',
    features: ALL_FEATURES_ENABLED,
  },
  enterprise: {
    id: 'enterprise',
    label: 'Max',
    description: 'Gros bar / réseau — équipe jusqu\'à 20 personnes (promoteur inclus)',
    maxMembers: 20,
    monthlyPriceXOF: 30000,
    dataTier: 'balanced',
    features: ALL_FEATURES_ENABLED,
  },
} as const;

// =====================================================
// HELPERS
// =====================================================

/** Récupérer la définition d'un plan à partir de son ID (fallback: starter) */
export function getPlan(planId: string | undefined): PlanDefinition {
  if (planId && planId in PLANS) {
    return PLANS[planId as PlanId];
  }
  return PLANS.starter;
}

/** Vérifier si une feature est disponible pour un plan donné */
export function hasFeature(planId: string | undefined, feature: FeatureKey): boolean {
  return getPlan(planId).features[feature];
}

/** Prix mensuel en XOF du plan (fallback: starter) */
export function getPlanPrice(planId: string | undefined): number {
  return getPlan(planId).monthlyPriceXOF;
}

/** Vérifier si le nombre de membres actifs atteint la limite du plan */
export function isMemberLimitReached(planId: string | undefined, activeMemberCount: number): boolean {
  return activeMemberCount >= getPlan(planId).maxMembers;
}

/** Labels pour affichage dans l'UI */
export const FEATURE_LABELS: Record<FeatureKey, string> = {
  accounting: 'Comptabilité',
  exports: 'Exports de données',
  promotions: 'Promotions',
  forecasting: 'Prévisions IA',
};

/** Liste ordonnée des plans pour affichage */
export const PLAN_ORDER: PlanId[] = ['starter', 'pro', 'enterprise'];
