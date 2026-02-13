import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { OnboardingCompletionService } from '../services/onboarding/completionTracking.service';

/**
 * Onboarding Step Enum
 * Role-based workflow paths defined
 */
export enum OnboardingStep {
  // Shared initial steps
  WELCOME = 'welcome',
  ROLE_DETECTED = 'role_detected',

  // Owner/Promoter path (7 steps)
  OWNER_BAR_DETAILS = 'owner_bar_details',
  OWNER_ADD_MANAGERS = 'owner_add_managers',
  OWNER_SETUP_STAFF = 'owner_setup_staff',
  OWNER_ADD_PRODUCTS = 'owner_add_products',
  OWNER_STOCK_INIT = 'owner_stock_init',
  OWNER_REVIEW = 'owner_review',

  // Manager path (3 steps)
  MANAGER_ROLE_CONFIRM = 'manager_role_confirm',
  MANAGER_CHECK_STAFF = 'manager_check_staff',
  MANAGER_TOUR = 'manager_tour',

  // Bartender path (3 steps)
  BARTENDER_INTRO = 'bartender_intro',
  BARTENDER_DEMO = 'bartender_demo',
  BARTENDER_TEST_SALE = 'bartender_test_sale',

  // Completion
  COMPLETE = 'complete',
}

export type UserRole = 'promoteur' | 'gerant' | 'serveur' | 'owner' | 'manager' | 'bartender';

/**
 * Step data stored in localStorage for persistence
 */
export interface StepData {
  [OnboardingStep.OWNER_BAR_DETAILS]?: {
    barName: string;
    location: string;
    closingHour: number;
    operatingMode: 'full' | 'simplifié';
    contact?: string;
  };
  [OnboardingStep.OWNER_SETUP_STAFF]?: any;
  [OnboardingStep.OWNER_ADD_PRODUCTS]?: any;
  [OnboardingStep.OWNER_STOCK_INIT]?: any;
  [OnboardingStep.MANAGER_TOUR]?: any;
}

/**
 * Onboarding context state
 */
export interface OnboardingState {
  isActive: boolean;
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
  userRole: UserRole | null;
  barId: string | null;
  userId: string | null;
  stepData: StepData;
  isComplete: boolean;
  barIsAlreadySetup: boolean; // New: Flag to skip config if bar is ready
  startedAt: string | null;
  lastUpdatedAt: string | null;
  navigationDirection: 'forward' | 'backward';
  isHydrating: boolean;
}

/**
 * Onboarding context actions
 */
export interface OnboardingContextType extends OnboardingState {
  initializeOnboarding: (userId: string, barId: string, role: UserRole, barIsAlreadySetup?: boolean) => void;
  updateBarId: (barId: string) => void;
  goToStep: (step: OnboardingStep) => void;
  nextStep: () => void;
  previousStep: () => void;
  skipStep: (step: OnboardingStep) => void;
  skipTour: () => void;
  completeStep: (step: OnboardingStep, data?: any) => void;
  completeOnboarding: () => void;
  completeTraining: () => Promise<void>;
  updateStepData: (step: OnboardingStep, data: any) => void;
  resetOnboarding: () => void;
  stepSequence: OnboardingStep[];
}

const defaultState: OnboardingState = {
  isActive: false,
  currentStep: OnboardingStep.WELCOME,
  completedSteps: [],
  userRole: null,
  barId: null,
  userId: null,
  stepData: {},
  isComplete: false,
  barIsAlreadySetup: false,
  startedAt: null,
  lastUpdatedAt: null,
  navigationDirection: 'forward',
  isHydrating: false,
};

export const OnboardingContext = createContext<OnboardingContextType | undefined>(
  undefined
);

// Removed: localStorage no longer used for onboarding persistence

/**
 * Get step sequence based on role
 */
function getStepSequence(role: UserRole | null, barIsAlreadySetup: boolean = false): OnboardingStep[] {
  let sequence: OnboardingStep[] = [];

  // Rule: If bar is already setup, we go into training/academy mode for everyone
  // This allows Promoters to access the Academy (Manager Tour) even if setup is done
  const isTrainingOnly = barIsAlreadySetup;

  switch (role) {
    case 'promoteur':
    case 'owner':
      if (isTrainingOnly) {
        // [NEW] Training path for Owner/Promoteuer in a running bar
        // Reuses the Manager Academy tour which is comprehensive
        // Removed generic intro steps (WELCOME, ROLE_DETECTED) for direct access
        sequence = [
          OnboardingStep.MANAGER_TOUR,
        ];
      } else {
        // Setup path for Owner in a new bar
        sequence = [
          OnboardingStep.WELCOME,
          OnboardingStep.ROLE_DETECTED,
          OnboardingStep.OWNER_BAR_DETAILS,
          OnboardingStep.OWNER_ADD_MANAGERS,
          OnboardingStep.OWNER_SETUP_STAFF,
          OnboardingStep.OWNER_ADD_PRODUCTS,
          OnboardingStep.OWNER_STOCK_INIT,
          OnboardingStep.OWNER_REVIEW,
        ];
      }
      break;

    case 'gerant':
    case 'manager':
      if (isTrainingOnly) {
        // Training path for Manager in a running bar
        // Removed generic intro steps for direct access
        sequence = [
          OnboardingStep.MANAGER_TOUR,
        ];
      } else {
        // Setup Assist path for Manager in a new bar
        sequence = [
          OnboardingStep.WELCOME,
          OnboardingStep.ROLE_DETECTED,
          OnboardingStep.MANAGER_ROLE_CONFIRM,
          OnboardingStep.MANAGER_CHECK_STAFF,
          OnboardingStep.MANAGER_TOUR,
          // Shared Setup Responsibility (Manager assists Owner)
          OnboardingStep.OWNER_ADD_PRODUCTS,
          OnboardingStep.OWNER_SETUP_STAFF,
          OnboardingStep.OWNER_STOCK_INIT,
          OnboardingStep.OWNER_REVIEW,
        ];
      }
      break;

    case 'serveur':
    case 'bartender':
      if (isTrainingOnly) {
        // Training path for Bartender in a running bar
        // Removed generic intro steps for direct access
        sequence = [
          OnboardingStep.BARTENDER_INTRO,
          OnboardingStep.BARTENDER_DEMO,
          OnboardingStep.BARTENDER_TEST_SALE,
        ];
      } else {
        // Onboarding path for Bartender (similar structure but keeping intro for consistence if needed, though they usually join existing bars)
        sequence = [
          OnboardingStep.WELCOME,
          OnboardingStep.ROLE_DETECTED,
          OnboardingStep.BARTENDER_INTRO,
          OnboardingStep.BARTENDER_DEMO,
          OnboardingStep.BARTENDER_TEST_SALE,
        ];
      }
      break;

    default:
      sequence = [OnboardingStep.WELCOME, OnboardingStep.ROLE_DETECTED];
      break;
  }
  // Ensure COMPLETE is always the last step if a sequence is defined
  if (sequence.length > 0 && sequence[sequence.length - 1] !== OnboardingStep.COMPLETE) {
    sequence.push(OnboardingStep.COMPLETE);
  }
  return sequence;
}

/**
 * Get next step in sequence
 */
function getNextStep(currentStep: OnboardingStep, role: UserRole | null, barIsAlreadySetup: boolean): OnboardingStep {
  const sequence = getStepSequence(role, barIsAlreadySetup);
  const currentIndex = sequence.indexOf(currentStep);
  return currentIndex < sequence.length - 1 ? sequence[currentIndex + 1] : OnboardingStep.COMPLETE;
}

/**
 * Get previous step in sequence
 */
function getPreviousStep(currentStep: OnboardingStep, role: UserRole | null, barIsAlreadySetup: boolean): OnboardingStep {
  const sequence = getStepSequence(role, barIsAlreadySetup);
  const currentIndex = sequence.indexOf(currentStep);
  return currentIndex > 0 ? sequence[currentIndex - 1] : sequence[0];
}

interface OnboardingProviderProps {
  children: ReactNode;
}

export const OnboardingProvider: React.FC<OnboardingProviderProps> = ({ children }) => {
  const [state, setState] = useState<OnboardingState>(defaultState);

  // Reset onboarding state when barId changes (user switched bars)
  // [FIX] Removed useEffect that caused race condition resetting step to WELCOME
  // The reset is now handled explicitly in updateBarId

  // Hydrate stepData from database when barId changes (resuming onboarding)
  useEffect(() => {
    if (!state.barId) return;

    let isCancelled = false;

    // Start hydration
    if (!state.isHydrating) {
      updateState({ isHydrating: true });
    }

    const hydrateFromDatabase = async () => {
      try {
        const { data: bar } = await supabase
          .from('bars')
          .select('name, address, settings, is_setup_complete')
          .eq('id', state.barId!)
          .single();

        if (isCancelled) return;

        // Build stepData from database
        const hydratedStepData: StepData = {};
        let dbIsSetupComplete = false;

        if (bar) {
          // Sync setup status from DB (Source of Truth)
          dbIsSetupComplete = !!bar.is_setup_complete;

          // ✅ Type-safe settings extraction with Record<string, unknown>
          const settings = (bar.settings as Record<string, unknown> | null) || {};
          const businessDayCloseHour = typeof settings.businessDayCloseHour === 'number'
            ? settings.businessDayCloseHour
            : 6;
          const operatingMode = settings.operatingMode === 'full' ? 'full' : 'simplifié';

          hydratedStepData[OnboardingStep.OWNER_BAR_DETAILS] = {
            barName: bar.name || '',
            location: bar.address || '',
            closingHour: businessDayCloseHour,
            operatingMode: operatingMode as 'full' | 'simplifié',
            contact: '',
          };
        }

        // Note: Products, Staff, and Stock data are no longer loaded into context
        // because we now use RedirectSteps that check DB state directly via CompletionService

        // Update state with hydrated data and release loading
        if (!isCancelled) {
          updateState({
            stepData: hydratedStepData,
            barIsAlreadySetup: dbIsSetupComplete, // Fixes Flicker: Enforce DB truth
            isHydrating: false
          });
        }
      } catch (error) {
        if (!isCancelled) {
          console.error('Failed to hydrate onboarding data from database:', error);
          updateState({ isHydrating: false });
        }
      }
    };

    hydrateFromDatabase();

    return () => {
      isCancelled = true;
    };
  }, [state.barId]);

  const updateState = (updates: Partial<OnboardingState>) => {
    setState((prev) => ({
      ...prev,
      ...updates,
      lastUpdatedAt: new Date().toISOString(),
    }));
  };

  const initializeOnboarding = (userId: string, barId: string, role: UserRole, barIsAlreadySetup: boolean = false) => {
    // Force conversion to string to avoid "Cannot convert object to primitive value" errors
    const safeUserId = userId ? String(userId) : '';
    const safeBarId = barId ? String(barId) : '';
    const safeRole = (role ? String(role) : 'serveur') as UserRole;

    // Calculate initial step based on sequence (dynamic start)
    // This allows Training Mode to skip generic intro steps
    const sequence = getStepSequence(safeRole, barIsAlreadySetup);
    const initialStep = sequence.length > 0 ? sequence[0] : OnboardingStep.WELCOME;

    updateState({
      isActive: true,
      userId: safeUserId,
      barId: safeBarId,
      userRole: safeRole,
      barIsAlreadySetup: barIsAlreadySetup,
      currentStep: initialStep, // Dynamic start step
      completedSteps: [],
      stepData: {},
      isComplete: false,
      startedAt: new Date().toISOString(),
      navigationDirection: 'forward',
    });
  };

  // Update barId when user switches bars (triggers hydration and reset)
  const updateBarId = (newBarId: string) => {
    const safeBarId = newBarId ? String(newBarId) : null;

    // Explicitly reset state when bar changes
    updateState({
      barId: safeBarId,
      currentStep: OnboardingStep.WELCOME,
      completedSteps: [],
      stepData: {},
      isComplete: false,
      isHydrating: true, // Show loading immediately
      // Do NOT reset barIsAlreadySetup to 'false' blindly if we want to avoid layout shift,
      // but 'false' is safer than keeping the old bar's status.
      // The hydration effect will correct it in <500ms.
      barIsAlreadySetup: false,
    });
  };

  const goToStep = (step: OnboardingStep) => {
    updateState({ currentStep: step });
  };

  const nextStep = () => {
    const next = getNextStep(state.currentStep, state.userRole, state.barIsAlreadySetup);
    updateState({
      currentStep: next,
      isComplete: next === OnboardingStep.COMPLETE,
      navigationDirection: 'forward',
    });
  };

  const previousStep = () => {
    const prev = getPreviousStep(state.currentStep, state.userRole, state.barIsAlreadySetup);
    updateState({
      currentStep: prev,
      navigationDirection: 'backward',
    });
  };

  const skipStep = () => {
    // Mark as skipped but move forward
    nextStep();
  };

  const skipTour = () => {
    updateState({
      isComplete: true,
      currentStep: OnboardingStep.COMPLETE,
    });
  };

  const completeStep = (step: OnboardingStep, data?: any) => {
    const newCompletedSteps = Array.from(new Set([...state.completedSteps, step]));
    updateState({
      completedSteps: newCompletedSteps,
      stepData: data
        ? {
          ...state.stepData,
          [step]: data,
        }
        : state.stepData,
    });
  };

  const completeTraining = async () => {
    if (!state.userId || !state.userRole) return;

    try {
      // Get latest training version for user's role
      const { data: latestVersion } = await supabase
        .from('training_versions')
        .select('version')
        .eq('role', state.userRole)
        .order('version', { ascending: false })
        .limit(1)
        .single();

      const currentVersion = latestVersion?.version || 1;

      // Update user record with certification
      await supabase
        .from('users')
        .update({
          has_completed_onboarding: true,
          onboarding_completed_at: new Date().toISOString(),
          training_version_completed: currentVersion
        })
        .eq('id', state.userId);

      console.log(`🎓 Training certified for user ${state.userId}, version ${currentVersion}`);
    } catch (error) {
      console.error('❌ Error persisting training completion:', error);
    }
  };

  const completeOnboarding = async () => {
    // Update context state
    updateState({
      isComplete: true,
      currentStep: OnboardingStep.COMPLETE,
    });

    // Mark Training as complete too (if you set up, you are certified)
    await completeTraining();

    // Persist bar-level setup completion
    if (state.barId) {
      try {
        // Enforce Minimum Viable Setup Logic:
        // Only mark bar as complete if it has at least 1 product with stock.
        // Otherwise, leave it as incomplete (Banner will persist).
        const hasMinimumViableSetup = await OnboardingCompletionService.checkMinimumViableSetup(state.barId);

        if (hasMinimumViableSetup) {
          await supabase
            .from('bars')
            .update({ is_setup_complete: true })
            .eq('id', state.barId);
          console.log(`✅ Bar ${state.barId} setup marked as complete (Minimum Viable Setup Verified)`);
        } else {
          console.warn(`⚠️ Bar ${state.barId} setup NOT marked as complete (No stock found). Banner will persist.`);
        }
      } catch (error) {
        console.error('❌ Error persisting bar setup completion:', error);
      }
    }
  };

  const updateStepData = (step: OnboardingStep, data: any) => {
    updateState({
      stepData: {
        ...state.stepData,
        [step]: data,
      },
    });
  };

  const resetOnboarding = () => {
    updateState(defaultState);
  };

  const value: OnboardingContextType = {
    ...state,
    initializeOnboarding,
    updateBarId,
    goToStep,
    nextStep,
    previousStep,
    skipStep,
    skipTour,
    completeStep,
    completeOnboarding,
    completeTraining,
    updateStepData,
    resetOnboarding,
    stepSequence: getStepSequence(state.userRole, state.barIsAlreadySetup),
  };

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
};

/**
 * Hook to use onboarding context
 */
export const useOnboarding = (): OnboardingContextType => {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding must be used within OnboardingProvider');
  }
  return context;
};
