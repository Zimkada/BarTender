import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBar } from '../context/BarContext';
import { useOnboarding } from '../context/OnboardingContext';
import { OnboardingFlow } from '../components/onboarding/OnboardingFlow';

/**
 * Onboarding Page
 * Displays the onboarding workflow based on user role
 *
 * Route: /onboarding
 */
export const OnboardingPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentSession } = useAuth();
  const { currentBar, loading: barLoading } = useBar();
  const { isComplete: onboardingComplete } = useOnboarding();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!currentSession) {
      navigate('/login', { replace: true });
    }
  }, [currentSession, navigate]);

  // Redirect to dashboard if bar already setup complete AND user has already finished their tour
  useEffect(() => {
    // A user can access /onboarding if:
    // 1. The bar itself is NOT complete (needs physical setup)
    // 2. OR it's their first login (needs educational tour)
    const barNeedsSetup = currentBar?.isSetupComplete === false;
    const userNeedsTour = currentSession?.firstLogin === true;

    // We only redirect away if BOTH are finished
    const isEverythingDone = !barNeedsSetup && !userNeedsTour && onboardingComplete;

    if (isEverythingDone) {
      navigate('/dashboard', { replace: true });
    }
  }, [currentBar?.isSetupComplete, currentSession?.firstLogin, onboardingComplete, navigate]);

  // Loading state
  if (barLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Not authenticated
  if (!currentSession) {
    return null; // Will redirect to login
  }

  // No current bar
  if (!currentBar) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-md p-8 max-w-md text-center">
          <p className="text-gray-600 mb-4">No bar selected. Please select or create a bar first.</p>
          <button
            onClick={() => navigate('/dashboard', { replace: true })}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Render onboarding flow
  // Note: Users can access onboarding for training even if bar is already set up
  return <OnboardingFlow />;
};
