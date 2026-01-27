/**
 * OnboardingBanner Component
 * Shows "New bar needs setup" banner before redirect to onboarding
 * Feature: Allows users to defer setup or go immediately
 */

import React, { useState, useEffect } from 'react';
import { AlertCircle, ChevronRight, Clock } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useBar } from '../../context/BarContext';

export const OnboardingBanner: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentBar } = useBar();
  const [isDismissed, setIsDismissed] = useState(false);
  const [deferredUntil, setDeferredUntil] = useState<number | null>(null);

  // Show banner if:
  // 1. Bar exists AND Bar is not setup complete
  // 2. Not dismissed by user
  // 3. Deferral period not active
  // 4. User is NOT currently on the onboarding page
  // 5. User is NOT currently in an active redirection step (mode=onboarding)
  const isOnOnboardingPage = location.pathname === '/onboarding';
  const isActiveOnboardingMode = new URLSearchParams(location.search).get('mode') === 'onboarding';

  const shouldShow =
    currentBar &&
    !currentBar.isSetupComplete &&  // Only show if bar needs configuration
    !isOnOnboardingPage &&
    !isActiveOnboardingMode &&
    !isDismissed &&
    (!deferredUntil || Date.now() >= deferredUntil);

  // Load deferral state from localStorage on mount
  useEffect(() => {
    if (!currentBar?.id) return;

    const storageKey = `onboarding_deferred_${currentBar.id}`;
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const deferUntilTime = parseInt(stored, 10);
      if (Date.now() < deferUntilTime) {
        setDeferredUntil(deferUntilTime);
        setIsDismissed(true);
      } else {
        localStorage.removeItem(storageKey);
        setIsDismissed(false);
      }
    }
  }, [currentBar?.id]);

  if (!shouldShow) {
    return null;
  }

  const handleStartNow = () => {
    navigate('/onboarding', { replace: true });
  };

  const handleDeferSetup = () => {
    if (!currentBar?.id) return;

    const deferUntil = Date.now() + 24 * 60 * 60 * 1000;
    const storageKey = `onboarding_deferred_${currentBar.id}`;
    localStorage.setItem(storageKey, String(deferUntil));

    setDeferredUntil(deferUntil);
    setIsDismissed(true);
  };

  // Banner content (only shown for bar configuration)
  const title = `🎯 Finalisez la configuration de ${currentBar?.name}`;
  const description = "Configurez votre bar en quelques minutes. Ajoutez les produits, le personnel et vos préférences.";
  const buttonText = "Commencer";

  return (
    <div className="fixed top-16 sm:top-20 md:top-24 left-0 right-0 z-40">
      <div className="mx-auto max-w-7xl px-3 md:px-4 py-2 md:py-3">
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-l-4 border-amber-500 rounded-lg shadow-md p-3 md:p-4 flex flex-col md:flex-row items-start md:items-center gap-3 md:gap-4">
          <AlertCircle className="w-5 h-5 md:w-6 md:h-6 text-amber-600 flex-shrink-0 md:mt-1 mt-0.5" />

          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-amber-900 text-sm md:text-base">
              {title}
            </h3>
            <p className="text-xs md:text-sm text-amber-800 mt-1">
              {description}
            </p>
          </div>

          <div className="flex items-center gap-2 md:gap-3 flex-shrink-0 w-full md:w-auto">
            <button
              onClick={handleDeferSetup}
              className="flex items-center justify-center md:justify-start gap-1 px-2 md:px-3 py-2 text-xs md:text-sm bg-white text-amber-900 rounded hover:bg-amber-50 transition-colors border border-amber-200 font-medium flex-1 md:flex-none"
              title="Me rappeler dans 24 heures"
            >
              <Clock className="w-3.5 h-3.5 md:w-4 md:h-4 flex-shrink-0" />
              <span>Plus tard</span>
            </button>
            <button
              onClick={handleStartNow}
              className="flex items-center justify-center md:justify-start gap-1 px-3 md:px-4 py-2 text-xs md:text-sm bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors font-medium flex-1 md:flex-none"
            >
              <span>{buttonText}</span>
              <ChevronRight className="w-3.5 h-3.5 md:w-4 md:h-4 flex-shrink-0" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
