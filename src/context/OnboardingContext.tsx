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

export type UserRole = 'promoteur' | 'gerant' | 'serveur' | 'owner' | 'manager' | 'bartender' | 'gérant';

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
  startedAt: string | null;
  lastUpdatedAt: string | null;
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
        OnboardingStep.OWNER_CLOSING_HOUR,
        OnboardingStep.OWNER_REVIEW,
      ];
      break;

    case 'gerant':
    case 'gérant':
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

  // Load state from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);

        // Defensive: ensure critical fields are primitives
        const safeRole = (parsed.userRole ? String(parsed.userRole) : null) as UserRole | null;
        const safeUserId = parsed.userId ? String(parsed.userId) : null;
        const safeBarId = parsed.barId ? String(parsed.barId) : null;

        setState({
          ...parsed,
          userRole: safeRole,
          userId: safeUserId,
          barId: safeBarId,
          startedAt: typeof parsed.startedAt === 'string' ? parsed.startedAt : null,
          lastUpdatedAt: typeof parsed.lastUpdatedAt === 'string' ? parsed.lastUpdatedAt : null,
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
