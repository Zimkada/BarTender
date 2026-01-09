import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

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
  OWNER_CLOSING_HOUR = 'owner_closing_hour',
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

export type UserRole = 'promoteur' | 'gérant' | 'serveur';

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
  [OnboardingStep.OWNER_ADD_MANAGERS]?: {
    managerIds: string[];
  };
  [OnboardingStep.OWNER_SETUP_STAFF]?: {
    serverNames: string[];
  };
  [OnboardingStep.OWNER_ADD_PRODUCTS]?: {
    products: Array<{
      productId: string;
      localPrice: number;
    }>;
  };
  [OnboardingStep.OWNER_STOCK_INIT]?: {
    stocks: Record<string, number>;
  };
  [OnboardingStep.OWNER_CLOSING_HOUR]?: {
    closingHour: number;
  };
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
  startedAt: Date | null;
  lastUpdatedAt: Date | null;
}

/**
 * Onboarding context actions
 */
export interface OnboardingContextType extends OnboardingState {
  initializeOnboarding: (userId: string, barId: string, role: UserRole) => void;
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
};

export const OnboardingContext = createContext<OnboardingContextType | undefined>(
  undefined
);

const STORAGE_KEY = 'onboarding_progress';

/**
 * Get step sequence based on role
 */
function getStepSequence(role: UserRole | null): OnboardingStep[] {
  switch (role) {
    case 'promoteur':
      return [
        OnboardingStep.WELCOME,
        OnboardingStep.ROLE_DETECTED,
        OnboardingStep.OWNER_BAR_DETAILS,
        OnboardingStep.OWNER_ADD_MANAGERS,
        OnboardingStep.OWNER_SETUP_STAFF,
        OnboardingStep.OWNER_ADD_PRODUCTS,
        OnboardingStep.OWNER_STOCK_INIT,
        OnboardingStep.OWNER_CLOSING_HOUR,
        OnboardingStep.OWNER_REVIEW,
        OnboardingStep.COMPLETE,
      ];

    case 'gérant':
      return [
        OnboardingStep.WELCOME,
        OnboardingStep.ROLE_DETECTED,
        OnboardingStep.MANAGER_ROLE_CONFIRM,
        OnboardingStep.MANAGER_CHECK_STAFF,
        OnboardingStep.MANAGER_TOUR,
        OnboardingStep.COMPLETE,
      ];

    case 'serveur':
      return [
        OnboardingStep.WELCOME,
        OnboardingStep.ROLE_DETECTED,
        OnboardingStep.BARTENDER_INTRO,
        OnboardingStep.BARTENDER_DEMO,
        OnboardingStep.BARTENDER_TEST_SALE,
        OnboardingStep.COMPLETE,
      ];

    default:
      return [OnboardingStep.WELCOME, OnboardingStep.ROLE_DETECTED];
  }
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

  // Load state from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setState({
          ...parsed,
          startedAt: parsed.startedAt ? new Date(parsed.startedAt) : null,
          lastUpdatedAt: parsed.lastUpdatedAt ? new Date(parsed.lastUpdatedAt) : null,
        });
      } catch (error) {
        console.error('Failed to parse onboarding state from storage', error);
      }
    }
  }, []);

  // Persist state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const updateState = (updates: Partial<OnboardingState>) => {
    setState((prev) => ({
      ...prev,
      ...updates,
      lastUpdatedAt: new Date(),
    }));
  };

  const initializeOnboarding = (userId: string, barId: string, role: UserRole) => {
    updateState({
      isActive: true,
      userId,
      barId,
      userRole: role,
      currentStep: OnboardingStep.WELCOME,
      completedSteps: [],
      stepData: {},
      isComplete: false,
      startedAt: new Date(),
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
    });
  };

  const previousStep = () => {
    const prev = getPreviousStep(state.currentStep, state.userRole);
    updateState({ currentStep: prev });
  };

  const skipStep = (step: OnboardingStep) => {
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
    localStorage.removeItem(STORAGE_KEY);
  };

  const value: OnboardingContextType = {
    ...state,
    initializeOnboarding,
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
