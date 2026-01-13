/**
 * OnboardingBanner Component
 * Shows "New bar needs setup" banner before redirect to onboarding
 * Feature: Allows users to defer setup or go immediately
 */

import React, { useState, useEffect } from 'react';
import { AlertCircle, ChevronRight, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useBar } from '@/context/BarContext';

export const OnboardingBanner: React.FC = () => {
  const navigate = useNavigate();
  const { currentBar } = useBar();
  const [isDismissed, setIsDismissed] = useState(false);
  const [deferredUntil, setDeferredUntil] = useState<number | null>(null);

  // Show banner if:
  // 1. Bar exists and is not setup complete
  // 2. Not dismissed by user
  // 3. Deferral period not active
  const shouldShow =
    currentBar &&
    !currentBar.is_setup_complete &&
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
        // Deferral expired, show banner again
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

    // Defer for 24 hours
    const deferUntil = Date.now() + 24 * 60 * 60 * 1000;
    const storageKey = `onboarding_deferred_${currentBar.id}`;
    localStorage.setItem(storageKey, String(deferUntil));

    setDeferredUntil(deferUntil);
    setIsDismissed(true);
  };

  return (
    <div className="fixed top-16 left-0 right-0 z-40">
      <div className="mx-auto max-w-7xl px-3 md:px-4 py-3">
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-l-4 border-amber-500 rounded-lg shadow-md p-4 flex items-start gap-4">
          {/* Icon */}
          <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-1" />

          {/* Content */}
          <div className="flex-1">
            <h3 className="font-semibold text-amber-900">
              🎯 Complete Setup for {currentBar?.name}
            </h3>
            <p className="text-sm text-amber-800 mt-1">
              Let's set up your bar in just a few minutes. Add products, staff, and configure your preferences.
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <button
              onClick={handleDeferSetup}
              className="flex items-center gap-1 px-3 py-2 text-sm bg-white text-amber-900 rounded hover:bg-amber-50 transition-colors border border-amber-200 font-medium"
              title="Remind me in 24 hours"
            >
              <Clock className="w-4 h-4" />
              <span>Later</span>
            </button>
            <button
              onClick={handleStartNow}
              className="flex items-center gap-1 px-4 py-2 text-sm bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors font-medium"
            >
              <span>Start</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
