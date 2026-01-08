import React, { useState } from 'react';
import { useOnboarding, OnboardingStep } from '@/context/OnboardingContext';
import { LoadingButton } from '@/components/ui/LoadingButton';

export const ManagerTourStep: React.FC = () => {
  const { completeStep, completeOnboarding } = useOnboarding();
  const [loading, setLoading] = useState(false);
  const [tourSkipped, setTourSkipped] = useState(false);

  const handleStartTour = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // In real implementation, would start interactive tour with Shepherd.js
      completeStep(OnboardingStep.MANAGER_TOUR, {
        tourStarted: true,
        timestamp: new Date().toISOString(),
      });

      // Simulate tour completion after 2s
      setTimeout(() => {
        completeOnboarding();
        window.location.href = '/dashboard';
      }, 2000);
    } catch (error) {
      console.error('Error starting tour:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSkipTour = async () => {
    setLoading(true);

    try {
      completeStep(OnboardingStep.MANAGER_TOUR, {
        tourSkipped: true,
        timestamp: new Date().toISOString(),
      });
      completeOnboarding();
      window.location.href = '/dashboard';
    } catch (error) {
      console.error('Error skipping tour:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-4">
      <div className="bg-white rounded-lg shadow-md p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Quick Tour (Optional)</h1>
          <p className="mt-2 text-gray-600">
            Learn the basics of creating sales and managing inventory
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleStartTour} className="space-y-6">
          {/* Tour Info */}
          <div className="p-6 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-4">
              <span className="text-3xl">👋</span>
              <div>
                <h2 className="text-lg font-semibold text-blue-900">2-Minute Walkthrough</h2>
                <p className="mt-2 text-blue-800">
                  We'll show you:
                </p>
                <ul className="mt-2 text-sm text-blue-800 space-y-1">
                  <li>✓ Dashboard overview (KPIs, date filters)</li>
                  <li>✓ How to create your first sale</li>
                  <li>✓ Managing inventory & stock</li>
                  <li>✓ Viewing team performance</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Why Tour */}
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <h3 className="font-medium text-gray-900 mb-2">Why take the tour?</h3>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>💡 Faster than figuring it out yourself</li>
              <li>💡 Learn best practices from day 1</li>
              <li>💡 Can always restart tour later</li>
            </ul>
          </div>

          {/* Tour Demo Preview */}
          <div className="p-4 bg-gray-100 border border-gray-300 rounded-lg text-center">
            <p className="text-gray-600 text-sm">
              [Interactive tour preview would appear here during actual tour]
            </p>
            <p className="text-gray-500 text-xs mt-2">Tour uses guided highlights + step-by-step explanations</p>
          </div>

          {/* Buttons */}
          <div className="flex flex-col gap-3 pt-6 border-t">
            <LoadingButton
              type="submit"
              isLoading={loading}
              loadingText="Starting tour..."
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold"
            >
              Start 2-Min Tour
            </LoadingButton>

            <LoadingButton
              type="button"
              isLoading={loading}
              loadingText="Skipping..."
              onClick={handleSkipTour}
              className="w-full px-6 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              Skip for Now
            </LoadingButton>

            <p className="text-xs text-gray-500 text-center">
              💡 You can restart the tour anytime from the dashboard
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};
