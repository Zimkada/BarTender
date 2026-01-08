import React, { useState } from 'react';
import { useOnboarding, OnboardingStep } from '@/context/OnboardingContext';
import { LoadingButton } from '@/components/ui/LoadingButton';

interface SetupStaffFormData {
  serverNames: string[];
}

export const SetupStaffStep: React.FC = () => {
  const { stepData, updateStepData, completeStep, nextStep, userRole } = useOnboarding();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string>('');
  const [newServerName, setNewServerName] = useState('');

  // Initialize form with saved data
  const savedData = stepData[OnboardingStep.OWNER_SETUP_STAFF] as SetupStaffFormData | undefined;
  const [formData, setFormData] = useState<SetupStaffFormData>({
    serverNames: savedData?.serverNames || [],
  });

  // Check if simplified mode (skip this step)
  const barDetails = stepData[OnboardingStep.OWNER_BAR_DETAILS] as any;
  const isSimplified = barDetails?.operatingMode === 'simplifié';

  const handleAddServer = () => {
    if (!newServerName.trim()) {
      setErrors('Server name required');
      return;
    }

    if (newServerName.length > 50) {
      setErrors('Server name too long');
      return;
    }

    setFormData((prev) => ({
      serverNames: [...prev.serverNames, newServerName],
    }));
    setNewServerName('');
    setErrors('');
  };

  const handleRemoveServer = (index: number) => {
    setFormData((prev) => ({
      serverNames: prev.serverNames.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoading(true);
    try {
      updateStepData(OnboardingStep.OWNER_SETUP_STAFF, formData);
      completeStep(OnboardingStep.OWNER_SETUP_STAFF, formData);
      nextStep();
    } catch (error) {
      console.error('Error saving staff:', error);
      setErrors('Failed to save staff');
    } finally {
      setLoading(false);
    }
  };

  // If simplified mode, skip this step automatically
  if (isSimplified) {
    return (
      <div className="w-full max-w-2xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-md p-8">
          <h1 className="text-3xl font-bold text-gray-900">Set Up Staff</h1>
          <p className="mt-4 text-gray-600">
            ℹ️ You're using <strong>Simplifié Mode</strong>, so staff are added dynamically
            by managers. Skip this step.
          </p>
          <div className="flex gap-3 mt-8 pt-6 border-t">
            <button
              type="button"
              onClick={() => window.history.back()}
              className="px-6 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              Back
            </button>
            <LoadingButton
              type="button"
              isLoading={loading}
              loadingText="Continuing..."
              onClick={async () => {
                setLoading(true);
                try {
                  completeStep(OnboardingStep.OWNER_SETUP_STAFF, { serverNames: [] });
                  nextStep();
                } finally {
                  setLoading(false);
                }
              }}
              className="ml-auto px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              Continue
            </LoadingButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto px-4">
      <div className="bg-white rounded-lg shadow-md p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Set Up Staff</h1>
          <p className="mt-2 text-gray-600">
            Create server accounts for your bartenders (Full Mode)
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Server Count */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm font-medium text-blue-900">
              Servers added: <strong>{formData.serverNames.length}</strong>
            </p>
          </div>

          {/* Server List */}
          {formData.serverNames.length > 0 && (
            <div className="space-y-2">
              {formData.serverNames.map((serverName, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg"
                >
                  <span className="text-sm text-gray-900">{serverName}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveServer(index)}
                    className="text-red-600 hover:text-red-700 text-sm font-medium"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add Server Input */}
          <div className="space-y-2">
            <label htmlFor="serverName" className="block text-sm font-medium text-gray-700">
              Server Name
            </label>
            <div className="flex gap-2">
              <input
                id="serverName"
                type="text"
                value={newServerName}
                onChange={(e) => {
                  setNewServerName(e.target.value);
                  setErrors('');
                }}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddServer();
                  }
                }}
                placeholder="e.g., Ahmed, Youssouf"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-200 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddServer}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
              >
                Add
              </button>
            </div>
          </div>

          {/* Error Message */}
          {errors && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700">{errors}</p>
            </div>
          )}

          {/* Info Box */}
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <h3 className="text-sm font-medium text-gray-900 mb-2">Why add servers now?</h3>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>✓ Each server has their own account</li>
              <li>✓ Track who created each sale</li>
              <li>✓ Personal performance metrics</li>
              <li>💡 You can add more servers later</li>
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
              loadingText="Saving..."
              className="ml-auto px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              Next Step
            </LoadingButton>
          </div>
        </form>
      </div>
    </div>
  );
};
