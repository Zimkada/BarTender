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

  const progressPercent = isWelcomeStep ? 0 : Math.round((displayStepNumber / displayTotalSteps) * 100);

  return (
    <div className="w-full bg-card border-b border-border py-3 md:py-4 px-3 md:px-6 sticky top-0 z-50 shadow-sm">
      <div className="max-w-4xl mx-auto">
        {/* Progress Header */}
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
            <h3 className="text-body-sm font-semibold text-foreground">Configuration en cours</h3>
            <span className="hidden sm:inline-block px-2 py-0.5 rounded-full bg-brand-subtle text-brand-primary text-micro font-semibold">
              {String(userRole).charAt(0).toUpperCase() + String(userRole).slice(1)}
            </span>
          </div>
          <div className="text-right">
            {isWelcomeStep ? (
              <p className="text-caption text-muted-foreground">
                <span className="font-semibold text-brand-primary">Introduction</span>
              </p>
            ) : (
              <p className="text-caption text-muted-foreground tabular-nums">
                Étape <span className="font-semibold text-brand-primary">{Math.max(1, Number(displayStepNumber))}</span> sur{' '}
                <span className="font-semibold text-foreground/80">{Math.max(1, Number(displayTotalSteps))}</span>
              </p>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="relative h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="absolute top-0 left-0 h-full bg-brand-primary transition-all duration-500 ease-out"
            style={{ width: `${isWelcomeStep ? 5 : progressPercent}%` }}
          />
        </div>

        {/* Labels info */}
        <div className="flex justify-between mt-1.5">
          <span className="text-micro text-muted-foreground">Bienvenue</span>
          <span className="text-micro text-brand-primary font-semibold tabular-nums">{progressPercent}% terminé</span>
          <span className="text-micro text-muted-foreground">Prêt</span>
        </div>
      </div>
    </div>
  );
};
