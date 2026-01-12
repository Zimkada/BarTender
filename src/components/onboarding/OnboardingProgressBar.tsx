import React, { useMemo } from 'react';
import { useOnboarding, OnboardingStep } from '@/context/OnboardingContext';

/**
 * OnboardingProgressBar
 *
 * Displays progress through onboarding steps based on user role
 * - Shows step counter (e.g., "Step 3 of 7")
 * - Visual progress bar with smooth animation
 * - Sticky positioning so always visible
 *
 * Handles all 3 role-specific flows:
 * - Owner: 9 steps (Welcome → Role → Bar Details → ... → Review)
 * - Manager: 5 steps (Welcome → Role → Confirm → Check Staff → Tour)
 * - Bartender: 5 steps (Welcome → Role → Intro → Demo → Test Sale)
 */
export const OnboardingProgressBar: React.FC = () => {
  const { currentStep, userRole } = useOnboarding();

  // Memoize step sequence based on role (only recalculate when role changes)
  const stepSequence = useMemo(() => {
    switch (userRole) {
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
        ];
      case 'gérant':
        return [
          OnboardingStep.WELCOME,
          OnboardingStep.ROLE_DETECTED,
          OnboardingStep.MANAGER_ROLE_CONFIRM,
          OnboardingStep.MANAGER_CHECK_STAFF,
          OnboardingStep.MANAGER_TOUR,
        ];
      case 'serveur':
        return [
          OnboardingStep.WELCOME,
          OnboardingStep.ROLE_DETECTED,
          OnboardingStep.BARTENDER_INTRO,
          OnboardingStep.BARTENDER_DEMO,
          OnboardingStep.BARTENDER_TEST_SALE,
        ];
      default:
        return [];
    }
  }, [userRole]);

  // If no valid role yet, don't render (loading state)
  if (stepSequence.length === 0) return null;

  const currentIndex = stepSequence.indexOf(currentStep);
  const isValidStep = currentIndex !== -1;

  // If somehow current step not in sequence, don't render
  if (!isValidStep) return null;

  const stepNumber = currentIndex + 1;
  const totalSteps = stepSequence.length;
  const progress = (stepNumber / totalSteps) * 100;

  return (
    <div className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-2xl mx-auto px-4 py-3">
        {/* Animated progress bar */}
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden mb-2">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Step counter + percentage */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-700 font-medium">
            Step <span className="font-bold text-blue-600">{stepNumber}</span> of{' '}
            <span className="font-bold">{totalSteps}</span>
          </span>
          <span className="text-gray-500">{Math.round(progress)}% complete</span>
        </div>
      </div>
    </div>
  );
};
