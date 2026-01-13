import React, { useMemo } from 'react';
import { useOnboarding, OnboardingStep } from '../../context/OnboardingContext';

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
      case 'owner':
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
      case 'gerant':
      case 'gérant':
      case 'manager':
        return [
          OnboardingStep.WELCOME,
          OnboardingStep.ROLE_DETECTED,
          OnboardingStep.MANAGER_ROLE_CONFIRM,
          OnboardingStep.MANAGER_CHECK_STAFF,
          OnboardingStep.MANAGER_TOUR,
        ];
      case 'serveur':
      case 'bartender':
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
  // Defensive: avoid NaN or Infinity
  const progress = totalSteps > 0 ? (stepNumber / totalSteps) * 100 : 0;
  const safeProgress = Math.min(Math.max(0, Number(progress) || 0), 100);

  return (
    <div className="w-full bg-white border-b border-gray-200 py-3 md:py-4 px-3 md:px-6 sticky top-0 z-50">
      <div className="max-w-4xl mx-auto">
        {/* Progress Header */}
        <div className="flex justify-between items-center mb-2 md:mb-3">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-gray-900 text-sm md:text-base">Configuration en cours</h3>
            <span className="hidden sm:inline-block px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">
              {String(userRole).charAt(0).toUpperCase() + String(userRole).slice(1)}
            </span>
          </div>
          <div className="text-right">
            <p className="text-xs md:text-sm font-medium text-gray-600">
              Étape <span className="font-bold text-blue-600">{Number(stepNumber) || 0}</span> sur{' '}
              <span className="font-bold">{Number(totalSteps) || 0}</span>
            </p>
          </div>
        </div>

        {/* Progress Bar Container */}
        <div className="relative h-2 md:h-2.5 bg-gray-100 rounded-full overflow-hidden border border-gray-200">
          <div
            className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500 ease-out shadow-sm"
            style={{ width: `${safeProgress}%` }}
          />
        </div>

        {/* Labels info */}
        <div className="flex justify-between mt-1 md:mt-2">
          <span className="text-[10px] md:text-xs text-gray-500">Bienvenue</span>
          <span className="text-[10px] md:text-xs font-bold text-blue-600">{Math.round(safeProgress)}% terminé</span>
          <span className="text-[10px] md:text-xs text-gray-500">Prêt !</span>
        </div>
      </div>
    </div>
  );
};
