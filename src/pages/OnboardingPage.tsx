import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useBar } from '@/context/BarContext';
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow';

/**
 * Onboarding Page
 * Displays the onboarding workflow based on user role
 *
 * Route: /onboarding
 */
export const OnboardingPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentSession, isLoading: authLoading } = useAuth();
  const { currentBar, isLoading: barLoading } = useBar();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !currentSession) {
      navigate('/login', { replace: true });
    }
  }, [authLoading, currentSession, navigate]);

  // Redirect to dashboard if bar already setup complete
  useEffect(() => {
    if (!barLoading && currentBar?.is_setup_complete) {
      navigate('/dashboard', { replace: true });
    }
  }, [barLoading, currentBar?.is_setup_complete, navigate]);

  // Loading state
  if (authLoading || barLoading) {
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

  // Bar already setup complete - shouldn't reach here due to redirect above
  if (currentBar.is_setup_complete) {
    return null; // Will redirect to dashboard
  }

  // Render onboarding flow
  return <OnboardingFlow />;
};
