import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useBar } from '@/context/BarContext';
import { useOnboarding } from '@/context/OnboardingContext';

/**
 * Hook to guard routes and redirect to onboarding if bar is not setup complete
 * Usage in protected routes:
 *
 * const { shouldRedirectToOnboarding } = useOnboardingGuard();
 * if (shouldRedirectToOnboarding) return <LoadingSpinner />;
 */
export const useOnboardingGuard = () => {
  const navigate = useNavigate();
  const { currentSession } = useAuth();
  const { currentBar } = useBar();
  const { isComplete } = useOnboarding();

  // Determine if user should be redirected to onboarding
  const shouldRedirectToOnboarding =
    !!currentSession &&
    !!currentBar &&
    !currentBar.isSetupComplete &&
    !isComplete;

  // Handle automatic redirect
  useEffect(() => {
    if (shouldRedirectToOnboarding) {
      navigate('/onboarding', { replace: true });
    }
  }, [shouldRedirectToOnboarding, navigate]);

  return {
    shouldRedirectToOnboarding,
    barSetupComplete: currentBar?.isSetupComplete || false,
    onboardingComplete: isComplete,
  };
};

/**
 * Check if user can access a specific feature (e.g., create sale)
 * Returns true if bar setup is complete, false otherwise
 */
export const useCanCreateSale = () => {
  const { currentBar } = useBar();
  return currentBar?.isSetupComplete || false;
};

/**
 * Check if manager can access bar that hasn't completed setup
 * Decision Q5: Manager = Accès complet (can create sales + finish setup)
 */
export const useManagerAccessLevel = () => {
  const { currentSession } = useAuth();
  const { currentBar } = useBar();

  // Manager can access incomplete bar with full access
  // This is implementation of Q5 decision: "Accès complet"
  return {
    canAccess: true, // Gérant has full access even if bar incomplete
    barSetupComplete: currentBar?.isSetupComplete || false,
    canCreateSales: true, // Manager can create sales regardless of setup status
  };
};
