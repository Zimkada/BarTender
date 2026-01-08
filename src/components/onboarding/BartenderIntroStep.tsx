import React, { useState } from 'react';
import { useOnboarding, OnboardingStep } from '@/context/OnboardingContext';
import { LoadingButton } from '@/components/ui/LoadingButton';

export const BartenderIntroStep: React.FC = () => {
  const { barId, stepData, completeStep, nextStep } = useOnboarding();
  const [loading, setLoading] = useState(false);

  // Get bar name if available
  const barDetails = stepData[OnboardingStep.OWNER_BAR_DETAILS] as any;
  const barName = barDetails?.barName || 'Your Bar';

  const handleUnderstand = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      completeStep(OnboardingStep.BARTENDER_INTRO, {
        timestamp: new Date().toISOString(),
      });
      nextStep();
    } catch (error) {
      console.error('Error confirming intro:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-4">
      <div className="bg-white rounded-lg shadow-md p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Welcome to {barName}! 🎉</h1>
          <p className="mt-2 text-gray-600">
            You've been added as a bartender/server
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleUnderstand} className="space-y-6">
          {/* Role Overview */}
          <div className="p-6 bg-purple-50 border border-purple-200 rounded-lg">
            <h2 className="text-lg font-semibold text-purple-900 mb-4">Your Role: Bartender/Server</h2>

            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <span className="text-2xl">🍺</span>
                <div>
                  <p className="font-medium text-gray-900">Main Job: Create Sales</p>
                  <p className="text-sm text-gray-700">Register each transaction, track inventory</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="text-2xl">👥</span>
                <div>
                  <p className="font-medium text-gray-900">Personal Metrics</p>
                  <p className="text-sm text-gray-700">Your sales tracked separately (personal stats)</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="text-2xl">📊</span>
                <div>
                  <p className="font-medium text-gray-900">Team Overview</p>
                  <p className="text-sm text-gray-700">See team performance (but not manage team)</p>
                </div>
              </div>
            </div>
          </div>

          {/* Main Task */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="font-medium text-blue-900 mb-2">Your Main Job in 3 Steps:</h3>
            <ol className="text-sm text-blue-800 space-y-2">
              <li className="flex gap-2">
                <span className="font-bold text-blue-900 w-6">1.</span>
                <span><strong>Select product(s)</strong> sold (beer, snacks, etc.)</span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-blue-900 w-6">2.</span>
                <span><strong>Confirm quantity</strong> and total price</span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-blue-900 w-6">3.</span>
                <span><strong>Choose payment method</strong> (cash, card, etc.)</span>
              </li>
            </ol>
          </div>

          {/* Pro Tips */}
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <h3 className="font-medium text-amber-900 mb-2">💡 Pro Tips:</h3>
            <ul className="text-sm text-amber-800 space-y-1">
              <li>✓ Keep transactions accurate for accounting</li>
              <li>✓ Watch stock levels - report when low</li>
              <li>✓ Questions? Ask your manager or owner</li>
              <li>✓ Click <strong>?</strong> button for help anytime</li>
            </ul>
          </div>

          {/* Next Steps */}
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <h3 className="font-medium text-gray-900 mb-2">What's next:</h3>
            <ol className="text-sm text-gray-700 space-y-2">
              <li className="flex gap-2">
                <span className="font-bold">1.</span>
                <span>Quick demo of creating a sale</span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold">2.</span>
                <span>Try creating your first sale (test)</span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold">3.</span>
                <span>You're ready to work!</span>
              </li>
            </ol>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-6 border-t">
            <button
              type="button"
              onClick={() => window.history.back()}
              className="px-6 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              Back
            </button>
            <LoadingButton
              type="submit"
              isLoading={loading}
              loadingText="Continuing..."
              className="ml-auto px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
            >
              I Understand
            </LoadingButton>
          </div>
        </form>
      </div>
    </div>
  );
};
