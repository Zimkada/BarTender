/**
 * OnboardingBanner Component
 * Shows "New bar needs setup" banner before redirect to onboarding
 * Feature: Allows users to defer setup or go immediately
 */

import React, { useState, useEffect } from 'react';
import { AlertCircle, ChevronRight, Clock } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useBar } from '../../context/BarContext';

export const OnboardingBanner: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentSession } = useAuth();
  const { currentBar } = useBar();
  const [isDismissed, setIsDismissed] = useState(false);
  const [deferredUntil, setDeferredUntil] = useState<number | null>(null);

  // Show banner if:
  // 1. User has permission (Promoteur or Gérant)
  // 2. Bar exists AND Bar is not setup complete
  // 3. Not dismissed by user
  // 4. Deferral period not active
  // 5. User is NOT currently on the onboarding page
  // 6. User is NOT currently in an active redirection step (mode=onboarding)
  const isOnOnboardingPage = location.pathname === '/onboarding';
  const isActiveOnboardingMode = new URLSearchParams(location.search).get('mode') === 'onboarding';

  const userRole = currentSession?.role;
  const canConfigure = userRole === 'promoteur' || userRole === 'gerant';

  const shouldShow =
    canConfigure &&
    currentBar &&
    !currentBar.isSetupComplete &&  // Only show if bar needs configuration
    !isOnOnboardingPage &&
    !isActiveOnboardingMode &&
    !isDismissed &&
    (!deferredUntil || Date.now() >= deferredUntil);

  // Load deferral state from localStorage on mount
  useEffect(() => {
    if (!currentBar?.id || !currentSession?.userId) return;

    const storageKey = `onboarding_deferred_${currentBar.id}_${currentSession.userId}`;
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
  }, [currentBar?.id, currentSession?.userId]);

  // Auto-Resolution Check:
  // If the bar is NOT marked as complete, check if it actually MEETS the requirements (e.g. added stock via Inventory).
  // If yes, auto-complete it and hide the banner.
  useEffect(() => {
    if (!shouldShow || !currentBar?.id) return;

    const checkAndResolve = async () => {
      try {
        const { OnboardingCompletionService } = await import('../../services/onboarding/completionTracking.service');
        const isViable = await OnboardingCompletionService.checkMinimumViableSetup(currentBar.id);

        if (isViable) {
          console.log('✨ [OnboardingBanner] Auto-resolving setup completion (Assets detected)');
          // Mark as complete in DB
          // Note: Ideally we should use a service method, but here we can do a direct call or use context if available.
          // Since we are inside a component, we rely on Supabase direct call to avoid context circular dependency complexity relative to this specific isolated requirement.
          const { supabase } = await import('../../lib/supabase');
          await supabase
            .from('bars')
            .update({ is_setup_complete: true })
            .eq('id', currentBar.id);

          // Force hide locally to avoid wait for real-time update
          setIsDismissed(true);
        }
      } catch (err) {
        console.error('Failed auto-resolution check', err);
      }
    };

    checkAndResolve();
  }, [shouldShow, currentBar?.id]);

  if (!shouldShow) {
    return null;
  }

  const handleStartNow = () => {
    navigate('/onboarding', { replace: true });
  };

  const handleDeferSetup = () => {
    if (!currentBar?.id || !currentSession?.userId) return;

    const deferUntil = Date.now() + 24 * 60 * 60 * 1000;
    const storageKey = `onboarding_deferred_${currentBar.id}_${currentSession.userId}`;
    localStorage.setItem(storageKey, String(deferUntil));

    setDeferredUntil(deferUntil);
    setIsDismissed(true);
  };

  const title = `Finalisez la configuration de ${currentBar?.name}`;
  const description = "Configurez votre bar en quelques minutes : produits, personnel, préférences.";
  const buttonText = "Commencer";

  return (
    <div className="fixed top-16 sm:top-20 md:top-24 left-0 right-0 z-40">
      <div className="mx-auto max-w-7xl px-3 md:px-4 py-2 md:py-3">
        <div className="bg-white border border-brand-subtle border-l-4 border-l-brand-primary rounded-xl shadow-sm p-3 md:p-4 flex flex-col md:flex-row items-start md:items-center gap-3 md:gap-4">
          <div className="w-9 h-9 rounded-lg bg-brand-subtle text-brand-primary flex items-center justify-center flex-shrink-0">
            <AlertCircle className="w-4 h-4" />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-body-sm font-semibold text-gray-900">
              {title}
            </h3>
            <p className="text-caption text-gray-500 mt-0.5">
              {description}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0 w-full md:w-auto">
            <button
              onClick={handleDeferSetup}
              className="flex items-center justify-center gap-1.5 px-3 h-9 text-caption font-medium bg-white text-gray-700 rounded-lg hover:border-brand-primary hover:text-brand-primary transition-colors border border-gray-200 flex-1 md:flex-none"
              title="Me rappeler dans 24 heures"
            >
              <Clock className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Plus tard</span>
            </button>
            <button
              onClick={handleStartNow}
              className="btn-brand flex items-center justify-center gap-1.5 px-4 h-9 text-caption font-semibold rounded-lg flex-1 md:flex-none"
            >
              <span>{buttonText}</span>
              <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
