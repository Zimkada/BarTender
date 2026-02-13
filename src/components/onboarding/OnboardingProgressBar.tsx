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
 * - Owner: 8 steps (Welcome → Role → Bar Details → ... → Review)
 * - Manager: 5 steps (Welcome → Role → Confirm → Check Staff → Tour)
 * - Bartender: 5 steps (Welcome → Role → Intro → Demo → Test Sale)
 */
export const OnboardingProgressBar: React.FC = () => {
  const { currentStep, userRole, stepSequence } = useOnboarding();

  // Removed: Local stepSequence calculation. 
  // We now use the single source of truth from OnboardingContext to ensure
  // the progress bar matches the actual flow (including Setup vs Training variations).

  // If no valid role yet, don't render (loading state)
  if (stepSequence.length === 0) return null;

  const currentIndex = stepSequence.indexOf(currentStep);
  const isValidStep = currentIndex !== -1;

  // If somehow current step not in sequence, don't render
  if (!isValidStep) return null;

  // We want to exclude the 'WELCOME' step (index 0) from the count to make 'ROLE_DETECTED' step 1
  // This makes the flow feel more logical: Welcome -> Step 1 (Role) -> Step 2 ...
  const totalSteps = stepSequence.length;
  const displayTotalSteps = totalSteps - 1;
  const displayStepNumber = currentIndex; // Index 1 becomes Step 1

  // Special case for Welcome step (Index 0)
  const isWelcomeStep = currentIndex === 0;

  return (
    <div className="w-full backdrop-blur-md bg-white/70 border-b border-white/30 py-3 md:py-4 px-3 md:px-6 sticky top-0 z-50 transition-all duration-300 shadow-sm">
      <div className="max-w-4xl mx-auto">
        {/* Progress Header */}
        <div className="flex justify-between items-center mb-2 md:mb-3">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-[hsl(var(--brand-hue),var(--brand-saturation),15%)] text-sm md:text-base">Configuration en cours</h3>
            <span className="hidden sm:inline-block px-2.5 py-0.5 bg-[hsl(var(--brand-hue),var(--brand-saturation),92%)] text-[hsl(var(--brand-hue),var(--brand-saturation),40%)] border border-[hsl(var(--brand-hue),var(--brand-saturation),85%)] text-xs font-bold rounded-full uppercase tracking-wider">
              {String(userRole).charAt(0).toUpperCase() + String(userRole).slice(1)}
            </span>
          </div>
          <div className="text-right">
            {isWelcomeStep ? (
              <p className="text-xs md:text-sm font-medium text-gray-500">
                <span className="font-bold text-[hsl(var(--brand-hue),var(--brand-saturation),40%)]">Introduction</span>
              </p>
            ) : (
              <p className="text-xs md:text-sm font-medium text-gray-500">
                Étape <span className="font-bold text-[hsl(var(--brand-hue),var(--brand-saturation),40%)]">{Math.max(1, Number(displayStepNumber))}</span> sur{' '}
                <span className="font-bold">{Math.max(1, Number(displayTotalSteps))}</span>
              </p>
            )}
          </div>
        </div>

        {/* Progress Bar Container */}
        <div className="relative h-2 md:h-2.5 bg-gray-200/50 rounded-full overflow-hidden border border-black/5 shadow-inner">
          <div
            className="absolute top-0 left-0 h-full bg-[image:var(--brand-gradient)] transition-all duration-700 ease-out shadow-[0_0_10px_rgba(245,158,11,0.5)]"
            style={{ width: `${isWelcomeStep ? 5 : (displayStepNumber / displayTotalSteps) * 100}%` }}
          />
        </div>

        {/* Labels info */}
        <div className="flex justify-between mt-1 md:mt-2">
          <span className="text-[10px] md:text-xs text-gray-400 font-medium">Bienvenue</span>
          <span className="text-[10px] md:text-xs font-bold text-[hsl(var(--brand-hue),var(--brand-saturation),40%)]">{isWelcomeStep ? 0 : Math.round((displayStepNumber / displayTotalSteps) * 100)}% terminé</span>
          <span className="text-[10px] md:text-xs text-gray-400 font-medium">Prêt !</span>
        </div>
      </div>
    </div>
  );
};
