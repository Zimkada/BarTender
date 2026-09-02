/**
 * Guide System Types
 * Modern, type-safe guide infrastructure for post-onboarding
 */

/**
 * ⚠️ DUPLICATION de `UserRole` (types/index.ts). Union inline structurellement
 * indépendante : le compilateur ne signale PAS un oubli ici.
 * Doit rester synchronisée à la main (MATRICE_RBAC_CUISINIER.md §10).
 */
export type UserRole = 'super_admin' | 'promoteur' | 'co_promoteur' | 'gerant' | 'serveur' | 'cuisinier';

export type GuideDifficulty = 'beginner' | 'intermediate' | 'advanced';

export type TriggerType = 'onMount' | 'onAction' | 'onFeatureAvailable';

export type MediaType = 'image' | 'video' | 'gif';

/**
 * Single step within a guide tour
 *
 * Note : les guides sont rendus comme des modales centrées informatives
 * (GuideTourModal) — pas de spotlight ou highlight d'éléments DOM. Si un
 * système de tour interactif est ajouté plus tard (React Joyride, Shepherd.js),
 * réintroduire elementSelector + position ici.
 */
export interface GuideStep {
  id: string;
  emoji?: string;
  title: string;
  description: string;

  // User action text
  action?: string; // "Click X to..." or "You'll see..."

  // Pro tips
  tips?: string[];

  // Optional media
  media?: GuideMedia;

  // Role-based visibility: defaults to all roles if not specified
  visibleFor?: UserRole[]; // e.g., ['promoteur', 'gerant'] or ['promoteur'] only

  /**
   * ⭐ §20 — ÉTAPE MASQUÉE QUAND LE GÉRANT OPÈRE SEUL (cuisine simplifiée).
   *
   * ⛔ LE BESOIN. L'écran Service condense ses trois colonnes en une liste et
   * remplace « Commencer » + « Prêt » + « Servir » par un bouton unique
   * « Plat servi ». Une visite qui enseigne les trois gestes envoie donc le
   * gérant chercher des boutons qui n'existent pas sur son écran.
   *
   * ⚠️ DISTINCT de `visibleFor`, qui filtre par RÔLE. Ici c'est le MODE du bar
   * qui décide : le même gérant, sur le même écran, doit voir l'étape en mode
   * complet et pas en mode simplifié. Aucun rôle ne peut exprimer cela.
   *
   * ⚠️ Absent = visible partout : les visites existantes ne changent pas.
   */
  hiddenInSimplifiedKitchen?: boolean;

  /**
   * ⭐ §20 — ÉTAPE RÉSERVÉE À LA CUISINE SIMPLIFIÉE.
   *
   * Le pendant du précédent : décrire le geste unique « Plat servi » n'a de
   * sens QUE dans ce mode. Affichée en mode complet, l'étape annoncerait un
   * bouton absent — le défaut symétrique de celui qu'on corrige.
   */
  onlyInSimplifiedKitchen?: boolean;
}

/**
 * Media asset for a guide step
 */
export interface GuideMedia {
  type: MediaType;
  url: string;
  alt: string;
}

/**
 * Trigger conditions for showing a guide
 */
export interface GuideTrigger {
  type: TriggerType;
  condition: string; // Evaluated condition (e.g., "isDashboard && isFirstVisit")
  delay?: number; // Milliseconds to wait before showing
  showOnce?: boolean; // Only show once per user
}

/**
 * Complete guide tour definition
 * Data-driven, can be JSON or TS
 */
export interface GuideTour {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;

  // Who sees this
  targetRoles: UserRole[];

  /**
   * ⭐ §3 — cette visite ne concerne-t-elle QUE les bars avec cuisine ?
   *
   * ⛔ SANS CE FILTRE, une visite « Monter votre carte » apparaîtrait dans la
   * liste d'aide d'un bar qui ne vend que des boissons. C'est le §3 violé à
   * l'endroit le PLUS visible : celui où l'utilisateur vient justement
   * chercher de quoi comprendre son application.
   *
   * ⚠️ Absent = visible partout. Le défaut reste donc le comportement actuel
   * pour les dix visites existantes, qui n'ont pas à être modifiées.
   */
  requiresRestaurant?: boolean;

  // Tour metadata
  estimatedDuration: number; // minutes
  difficulty: GuideDifficulty;
  emoji?: string;

  // Steps
  steps: GuideStep[];

  // When to show
  triggers: GuideTrigger[];

  // Version for updates
  version?: number;
}

/**
 * User's progress through a guide
 * Stored in Supabase
 */
export interface GuideProgress {
  id: string;
  user_id: string;
  tour_id: string;

  current_step_index: number;
  started_at: string; // ISO timestamp
  completed_at?: string; // ISO timestamp
  skipped_at?: string; // ISO timestamp
  helpful_rating?: number; // 1-5

  created_at: string;
  updated_at: string;
}

/**
 * Guide progress DTO for mutations
 */
export interface GuideProgressInput {
  user_id: string;
  tour_id: string;
  current_step_index?: number;
  completed_at?: string;
  skipped_at?: string;
  helpful_rating?: number;
}

/**
 * Context value for GuideContext
 */
export interface GuideContextType {
  // State
  activeTour: GuideTour | null;
  currentStepIndex: number;
  isVisible: boolean;
  isLoading: boolean;
  error: string | null;

  // Suggested guides for current page
  suggestedTours: GuideTour[];

  // Actions
  startTour: (tourId: string, tour?: GuideTour) => Promise<void>;
  nextStep: () => void;
  prevStep: () => void;
  completeTour: () => Promise<void>;
  skipTour: () => Promise<void>;
  rateTour: (rating: 1 | 2 | 3 | 4 | 5) => Promise<void>;
  closeTour: () => void;

  // Utilities
  getCurrentStep: () => GuideStep | null;
  getProgressPercentage: () => number;
  hasCompletedGuide: (tourId: string) => boolean;
}

/**
 * Hook return type for useGuide
 */
export type UseGuideReturn = GuideContextType;

/**
 * Analytics event for guides
 */
export interface GuideAnalyticsEvent {
  type: 'GUIDE_STARTED' | 'GUIDE_STEP_VIEWED' | 'GUIDE_COMPLETED' | 'GUIDE_SKIPPED' | 'GUIDE_RATED';
  tour_id: string;
  user_role: UserRole;
  step_index?: number;
  time_spent_seconds?: number;
  rating?: number;
  timestamp: string;
}
