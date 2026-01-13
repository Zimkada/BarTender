/**
 * Guide System Types
 * Modern, type-safe guide infrastructure for post-onboarding
 */

export type UserRole = 'super_admin' | 'promoteur' | 'gérant' | 'serveur';

export type GuideDifficulty = 'beginner' | 'intermediate' | 'advanced';

export type StepPosition = 'top' | 'bottom' | 'left' | 'right' | 'center';

export type TriggerType = 'onMount' | 'onAction' | 'onFeatureAvailable';

export type MediaType = 'image' | 'video' | 'gif';

/**
 * Single step within a guide tour
 */
export interface GuideStep {
  id: string;
  emoji?: string;
  title: string;
  description: string;

  // For spotlight/highlight
  elementSelector?: string; // CSS selector to highlight
  position?: StepPosition; // Tooltip position relative to element

  // User action text
  action?: string; // "Click X to..." or "You'll see..."

  // Pro tips
  tips?: string[];

  // Optional media
  media?: GuideMedia;
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
  startTour: (tourId: string) => void;
  nextStep: () => void;
  prevStep: () => void;
  completeTour: () => void;
  skipTour: () => void;
  rateTour: (rating: 1 | 2 | 3 | 4 | 5) => void;
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
