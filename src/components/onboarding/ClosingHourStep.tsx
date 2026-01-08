import React, { useState } from 'react';
import { useOnboarding, OnboardingStep } from '@/context/OnboardingContext';
import { LoadingButton } from '@/components/ui/LoadingButton';

export const ClosingHourStep: React.FC = () => {
  const { stepData, completeStep, nextStep } = useOnboarding();
  const [loading, setLoading] = useState(false);

  // Get closing hour from bar details (already set, just confirm)
  const barDetails = stepData[OnboardingStep.OWNER_BAR_DETAILS] as any;
  const closingHour = barDetails?.closingHour || 6;

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      completeStep(OnboardingStep.OWNER_CLOSING_HOUR, { closingHour });
      nextStep();
    } catch (error) {
      console.error('Error confirming closing hour:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-4">
      <div className="bg-white rounded-lg shadow-md p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Confirm Closing Hour</h1>
          <p className="mt-2 text-gray-600">
            This defines your business day. Sales before this hour count as previous day.
          </p>
        </div>

        {/* Current Closing Hour */}
        <form onSubmit={handleConfirm} className="space-y-6">
          <div className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg">
            <h2 className="text-2xl font-bold text-blue-900 mb-2">
              Closing Hour: {closingHour}:00 AM
            </h2>
            <p className="text-blue-800">
              Your business day closes at {closingHour}:00 and starts the next day
            </p>
          </div>

          {/* Scenario Examples */}
          <div className="space-y-4">
            <h3 className="font-medium text-gray-900">Example scenarios:</h3>

            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <p className="font-medium text-gray-900 mb-1">Scenario 1: Sale at 05:00 AM (5 AM)</p>
              <p className="text-sm text-gray-700">
                Closing hour = 6 AM → Sale is counted as <strong>yesterday</strong>
              </p>
            </div>

            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <p className="font-medium text-gray-900 mb-1">Scenario 2: Sale at 08:00 PM (8 PM)</p>
              <p className="text-sm text-gray-700">
                Closing hour = 6 AM → Sale is counted as <strong>today</strong>
              </p>
            </div>

            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <p className="font-medium text-gray-900 mb-1">Scenario 3: Sale at 02:00 AM (2 AM)</p>
              <p className="text-sm text-gray-700">
                Closing hour = 6 AM → Sale is counted as <strong>yesterday</strong>
              </p>
            </div>
          </div>

          {/* Info Box */}
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <h3 className="text-sm font-medium text-amber-900 mb-2">Why this matters:</h3>
            <ul className="text-sm text-amber-800 space-y-1">
              <li>✓ Accounting: reports match your financial calendar</li>
              <li>✓ Daily reconciliation: correct date for cash counts</li>
              <li>✓ Analytics: sales grouped by correct business day</li>
              <li>💡 You set this in Step 1, just confirming here</li>
            </ul>
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
              loadingText="Confirming..."
              className="ml-auto px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              Confirm & Continue
            </LoadingButton>
          </div>
        </form>
      </div>
    </div>
  );
};
