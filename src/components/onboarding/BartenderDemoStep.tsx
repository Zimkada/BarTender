import React, { useState } from 'react';
import { useOnboarding, OnboardingStep } from '@/context/OnboardingContext';
import { LoadingButton } from '@/components/ui/LoadingButton';

export const BartenderDemoStep: React.FC = () => {
  const { completeStep, nextStep } = useOnboarding();
  const [loading, setLoading] = useState(false);

  const handleWatchDemo = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // In real implementation, would show video or interactive demo
      completeStep(OnboardingStep.BARTENDER_DEMO, {
        demoWatched: true,
        timestamp: new Date().toISOString(),
      });
      nextStep();
    } catch (error) {
      console.error('Error watching demo:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSkipDemo = async () => {
    setLoading(true);

    try {
      completeStep(OnboardingStep.BARTENDER_DEMO, {
        demoSkipped: true,
        timestamp: new Date().toISOString(),
      });
      nextStep();
    } catch (error) {
      console.error('Error skipping demo:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-4">
      <div className="bg-white rounded-lg shadow-md p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Learn to Create a Sale</h1>
          <p className="mt-2 text-gray-600">
            Quick 1-minute walkthrough (optional)
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleWatchDemo} className="space-y-6">
          {/* Demo Preview */}
          <div className="p-6 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg">
            <div className="text-center">
              <div className="inline-block p-4 bg-white rounded-lg mb-4">
                <span className="text-4xl">▶️</span>
              </div>
              <h2 className="text-lg font-semibold text-purple-900 mb-2">
                Create Your First Sale in 3 Clicks
              </h2>
              <p className="text-purple-800 text-sm">
                See exactly how to register a transaction
              </p>
            </div>
          </div>

          {/* Step Breakdown */}
          <div className="space-y-3">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex gap-3">
                <span className="text-xl font-bold text-blue-900 w-8">1.</span>
                <div>
                  <p className="font-medium text-blue-900">Select Products</p>
                  <p className="text-sm text-blue-800">Choose what you sold (Heineken, snacks, etc.)</p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex gap-3">
                <span className="text-xl font-bold text-green-900 w-8">2.</span>
                <div>
                  <p className="font-medium text-green-900">Confirm Quantity</p>
                  <p className="text-sm text-green-800">Set how many units + total price</p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex gap-3">
                <span className="text-xl font-bold text-amber-900 w-8">3.</span>
                <div>
                  <p className="font-medium text-amber-900">Choose Payment</p>
                  <p className="text-sm text-amber-800">Cash, card, or other method</p>
                </div>
              </div>
            </div>
          </div>

          {/* Example Sale */}
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <h3 className="font-medium text-gray-900 mb-3">Example: Typical Sale</h3>
            <div className="space-y-2 text-sm text-gray-700">
              <div className="flex justify-between">
                <span>Product:</span>
                <strong>Heineken</strong>
              </div>
              <div className="flex justify-between">
                <span>Quantity:</span>
                <strong>1 bottle</strong>
              </div>
              <div className="flex justify-between">
                <span>Unit Price:</span>
                <strong>300 FCFA</strong>
              </div>
              <div className="border-t pt-2 mt-2 flex justify-between font-semibold">
                <span>Total:</span>
                <strong>300 FCFA</strong>
              </div>
              <div className="flex justify-between">
                <span>Payment:</span>
                <strong>Cash</strong>
              </div>
            </div>
          </div>

          {/* Why Learn */}
          <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
            <h3 className="font-medium text-indigo-900 mb-2">Why watch the demo?</h3>
            <ul className="text-sm text-indigo-800 space-y-1">
              <li>✓ See the actual interface</li>
              <li>✓ Faster than figuring it out yourself</li>
              <li>✓ Can rewatch anytime from dashboard</li>
            </ul>
          </div>

          {/* Buttons */}
          <div className="flex flex-col gap-3 pt-6 border-t">
            <LoadingButton
              type="submit"
              isLoading={loading}
              loadingText="Loading demo..."
              className="w-full px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-semibold"
            >
              ▶️ Watch Demo (1 min)
            </LoadingButton>

            <LoadingButton
              type="button"
              isLoading={loading}
              loadingText="Continuing..."
              onClick={handleSkipDemo}
              className="w-full px-6 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              Skip Demo
            </LoadingButton>
          </div>
        </form>
      </div>
    </div>
  );
};
