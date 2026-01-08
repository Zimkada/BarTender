import React, { useState } from 'react';
import { useOnboarding, OnboardingStep } from '@/context/OnboardingContext';
import { LoadingButton } from '@/components/ui/LoadingButton';

export const ManagerRoleConfirmStep: React.FC = () => {
  const { stepData, completeStep, nextStep } = useOnboarding();
  const [loading, setLoading] = useState(false);

  // Get bar name if available
  const barDetails = stepData[OnboardingStep.OWNER_BAR_DETAILS] as any;
  const barName = barDetails?.barName || 'Your Bar';

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      completeStep(OnboardingStep.MANAGER_ROLE_CONFIRM, {
        timestamp: new Date().toISOString(),
      });
      nextStep();
    } catch (error) {
      console.error('Error confirming role:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-4">
      <div className="bg-white rounded-lg shadow-md p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Welcome, Manager!</h1>
          <p className="mt-2 text-gray-600">
            You've been added to <strong>{barName}</strong>
          </p>
        </div>

        {/* Role Overview */}
        <form onSubmit={handleConfirm} className="space-y-6">
          <div className="p-6 bg-blue-50 border border-blue-200 rounded-lg">
            <h2 className="text-lg font-semibold text-blue-900 mb-4">Your Role: Manager</h2>

            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <span className="text-green-600 text-lg">✓</span>
                <div>
                  <p className="font-medium text-gray-900">Create Sales</p>
                  <p className="text-sm text-gray-700">Register transactions, apply promotions</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="text-green-600 text-lg">✓</span>
                <div>
                  <p className="font-medium text-gray-900">Manage Inventory</p>
                  <p className="text-sm text-gray-700">Track stock, set alerts, record supplies</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="text-green-600 text-lg">✓</span>
                <div>
                  <p className="font-medium text-gray-900">View Analytics</p>
                  <p className="text-sm text-gray-700">Daily sales, top products, team performance</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="text-gray-400 text-lg">✗</span>
                <div>
                  <p className="font-medium text-gray-900">Manage Team</p>
                  <p className="text-sm text-gray-700">Only owner can add/remove team members</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="text-gray-400 text-lg">✗</span>
                <div>
                  <p className="font-medium text-gray-900">Change Settings</p>
                  <p className="text-sm text-gray-700">Owner controls bar configuration</p>
                </div>
              </div>
            </div>
          </div>

          {/* Next Steps */}
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <h3 className="font-medium text-gray-900 mb-3">What's next:</h3>
            <ol className="text-sm text-gray-700 space-y-2">
              <li className="flex gap-2">
                <span className="font-semibold text-gray-900 w-6">1.</span>
                <span>Quick tour of the dashboard</span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-gray-900 w-6">2.</span>
                <span>Learn to create your first sale</span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-gray-900 w-6">3.</span>
                <span>Start working!</span>
              </li>
            </ol>
          </div>

          {/* Info */}
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-900">
              💡 <strong>Tip:</strong> Need help anytime? Click the <strong>?</strong> button in the bottom-right corner.
            </p>
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
              className="ml-auto px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              I Understand
            </LoadingButton>
          </div>
        </form>
      </div>
    </div>
  );
};
