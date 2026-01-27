import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBar } from '../context/BarContext';
import { useOnboarding } from '../context/OnboardingContext';
import { OnboardingFlow } from '../components/onboarding/OnboardingFlow';
import { TrainingFlow } from '../components/onboarding/TrainingFlow';

/**
 * Onboarding Page
 * Entry point that routes between:
 * 1. Bar Setup Flow (OnboardingFlow) - For new bars
 * 2. Training Flow (TrainingFlow) - For education/academy
 *
 * Route: /onboarding
 */
export const OnboardingPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentSession } = useAuth();
  const { currentBar, loading: barLoading } = useBar();
  const { isComplete: onboardingComplete } = useOnboarding();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!currentSession) {
      navigate('/login', { replace: true });
    }
  }, [currentSession, navigate]);

  // Determine Mode: Setup OR Training
  // Explicit "mode=training" param takes precedence
  // Otherwise, fallback to checking if bar needs setup
  const searchParams = new URLSearchParams(location.search);
  const modeParam = searchParams.get('mode');

  const barNeedsSetup = currentBar?.isSetupComplete === false;
  // If bar is already setup, we default to training mode (unless explicitly forced otherwise)
  const isTrainingMode = modeParam === 'training' || !barNeedsSetup;

  // Loading state
  if (barLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
          <p className="mt-4 text-gray-600">Chargement...</p>
        </div>
      </div>
    );
  }

  // Not authenticated
  if (!currentSession) {
    return null; // Will redirect to login
  }

  return (
    <>
      {isTrainingMode ? <TrainingFlow /> : <OnboardingFlow />}
    </>
  );
};
