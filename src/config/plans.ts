/**
 * plans.ts — Définition centralisée des plans d'utilisation BarTender
 *
 * Chaque bar a un plan assigné par le SuperAdmin dans bars.settings.plan
 * Le plan contrôle : maxMembers, dataTier, features disponibles
 * Le mode opérationnel (full/simplified) reste indépendant du plan
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
  dataTier: 'lite' | 'balanced' | 'enterprise';
  features: PlanFeatures;
}

export type FeatureKey = keyof PlanFeatures;

// =====================================================
// PLANS
// =====================================================

export const PLANS: Record<PlanId, PlanDefinition> = {
  starter: {
    id: 'starter',
    label: 'Starter',
    description: 'Ventes et stock basique — idéal pour démarrer',
    maxMembers: 2,
    dataTier: 'lite',
    features: {
      accounting: false,
      exports: false,
      promotions: false,
      forecasting: false,
    },
  },
  pro: {
    id: 'pro',
    label: 'Pro',
    description: 'Comptabilité, exports et promotions — pour les bars actifs',
    maxMembers: 8,
    dataTier: 'balanced',
    features: {
      accounting: true,
      exports: true,
      promotions: true,
      forecasting: false,
    },
  },
  enterprise: {
    id: 'enterprise',
    label: 'Enterprise',
    description: 'Toutes les fonctionnalités — pour les réseaux de bars',
    maxMembers: 20,
    dataTier: 'enterprise',
    features: {
      accounting: true,
      exports: true,
      promotions: true,
      forecasting: true,
    },
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
