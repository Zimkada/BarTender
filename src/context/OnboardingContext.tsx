import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../lib/supabase';

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
  // Les autres étapes n'ont plus besoin de stocker de données
  // car elles redirigent vers les menus réels
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
  startedAt: string | null;
  lastUpdatedAt: string | null;
  navigationDirection: 'forward' | 'backward';
}

/**
 * Onboarding context actions
 */
export interface OnboardingContextType extends OnboardingState {
  initializeOnboarding: (userId: string, barId: string, role: UserRole) => void;
  updateBarId: (barId: string) => void;
  goToStep: (step: OnboardingStep) => void;
  nextStep: () => void;
  previousStep: () => void;
  skipStep: (step: OnboardingStep) => void;
  skipTour: () => void;
  completeStep: (step: OnboardingStep, data?: any) => void;
  completeOnboarding: () => void;
  updateStepData: (step: OnboardingStep, data: any) => void;
  resetOnboarding: () => void;
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
  startedAt: null,
  lastUpdatedAt: null,
  navigationDirection: 'forward',
};

export const OnboardingContext = createContext<OnboardingContextType | undefined>(
  undefined
);

// Removed: localStorage no longer used for onboarding persistence

/**
 * Get step sequence based on role
 */
function getStepSequence(role: UserRole | null): OnboardingStep[] {
  let sequence: OnboardingStep[] = [];
  switch (role) {
    case 'promoteur':
    case 'owner':
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
      break;

    case 'gerant':
    case 'manager':
      sequence = [
        OnboardingStep.WELCOME,
        OnboardingStep.ROLE_DETECTED,
        OnboardingStep.MANAGER_ROLE_CONFIRM,
        OnboardingStep.MANAGER_CHECK_STAFF,
        OnboardingStep.MANAGER_TOUR,
      ];
      break;

    case 'serveur':
    case 'bartender':
      sequence = [
        OnboardingStep.WELCOME,
        OnboardingStep.ROLE_DETECTED,
        OnboardingStep.BARTENDER_INTRO,
        OnboardingStep.BARTENDER_DEMO,
        OnboardingStep.BARTENDER_TEST_SALE,
      ];
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
function getNextStep(currentStep: OnboardingStep, role: UserRole | null): OnboardingStep {
  const sequence = getStepSequence(role);
  const currentIndex = sequence.indexOf(currentStep);
  return currentIndex < sequence.length - 1 ? sequence[currentIndex + 1] : OnboardingStep.COMPLETE;
}

/**
 * Get previous step in sequence
 */
function getPreviousStep(currentStep: OnboardingStep, role: UserRole | null): OnboardingStep {
  const sequence = getStepSequence(role);
  const currentIndex = sequence.indexOf(currentStep);
  return currentIndex > 0 ? sequence[currentIndex - 1] : sequence[0];
}

interface OnboardingProviderProps {
  children: ReactNode;
}

export const OnboardingProvider: React.FC<OnboardingProviderProps> = ({ children }) => {
  const [state, setState] = useState<OnboardingState>(defaultState);

  // Reset onboarding state when barId changes (user switched bars)
  useEffect(() => {
    if (state.barId) {
      // When bar changes, reset all onboarding state to allow re-initialization
      // This ensures each bar has its own independent onboarding state
      // The database flag (is_setup_complete) is the source of truth for display
      updateState({
        currentStep: OnboardingStep.WELCOME,
        completedSteps: [],
        stepData: {},
        isComplete: false,
      });
    }
  }, [state.barId]);

  // Hydrate stepData from database when barId changes (resuming onboarding)
  useEffect(() => {
    if (!state.barId) return;

    const hydrateFromDatabase = async () => {
      try {
        const { data: bar } = await supabase
          .from('bars')
          .select('name, address, settings')
          .eq('id', state.barId!)
          .single();

        // Build stepData from database
        const hydratedStepData: StepData = {};

        if (bar) {
          const settings = (bar.settings as any) || {};
          hydratedStepData[OnboardingStep.OWNER_BAR_DETAILS] = {
            barName: bar.name || '',
            location: bar.address || '',
            closingHour: settings.businessDayCloseHour || 6,
            operatingMode: (settings.operatingMode === 'full' ? 'full' : 'simplifié') as 'full' | 'simplifié',
            contact: '',
          };
        }

        // Note: Products, Staff, and Stock data are no longer loaded into context
        // because we now use RedirectSteps that check DB state directly via CompletionService

        // Update state with hydrated data
        updateState({ stepData: hydratedStepData });
      } catch (error) {
        console.error('Failed to hydrate onboarding data from database:', error);
      }
    };

    hydrateFromDatabase();
  }, [state.barId]);

  const updateState = (updates: Partial<OnboardingState>) => {
    setState((prev) => ({
      ...prev,
      ...updates,
      lastUpdatedAt: new Date().toISOString(),
    }));
  };

  const initializeOnboarding = (userId: string, barId: string, role: UserRole) => {
    // Force conversion to string to avoid "Cannot convert object to primitive value" errors
    const safeUserId = userId ? String(userId) : '';
    const safeBarId = barId ? String(barId) : '';
    const safeRole = (role ? String(role) : 'serveur') as UserRole;

    updateState({
      isActive: true,
      userId: safeUserId,
      barId: safeBarId,
      userRole: safeRole,
      currentStep: OnboardingStep.WELCOME,
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
    updateState({
      barId: safeBarId,
    });
  };

  const goToStep = (step: OnboardingStep) => {
    updateState({ currentStep: step });
  };

  const nextStep = () => {
    const next = getNextStep(state.currentStep, state.userRole);
    updateState({
      currentStep: next,
      isComplete: next === OnboardingStep.COMPLETE,
      navigationDirection: 'forward',
    });
  };

  const previousStep = () => {
    const prev = getPreviousStep(state.currentStep, state.userRole);
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

  const completeOnboarding = () => {
    updateState({
      isComplete: true,
      currentStep: OnboardingStep.COMPLETE,
    });
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
    updateStepData,
    resetOnboarding,
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
