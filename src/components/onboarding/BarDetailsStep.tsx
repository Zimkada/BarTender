import React, { useState } from 'react';
import { useOnboarding, OnboardingStep } from '@/context/OnboardingContext';
import { LoadingButton } from '@/components/ui/LoadingButton';

interface BarDetailsFormData {
  barName: string;
  location: string;
  closingHour: number;
  operatingMode: 'full' | 'simplifié';
  contact?: string;
}

export const BarDetailsStep: React.FC = () => {
  const { stepData, updateStepData, completeStep, nextStep } = useOnboarding();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Initialize form with saved data if exists
  const savedData = stepData[OnboardingStep.OWNER_BAR_DETAILS] as BarDetailsFormData | undefined;
  const [formData, setFormData] = useState<BarDetailsFormData>({
    barName: savedData?.barName || '',
    location: savedData?.location || '',
    closingHour: savedData?.closingHour || 6,
    operatingMode: savedData?.operatingMode || 'simplifié',
    contact: savedData?.contact || '',
  });

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.barName.trim() || formData.barName.length < 3) {
      newErrors.barName = 'Bar name required (min 3 chars)';
    }
    if (formData.barName.length > 50) {
      newErrors.barName = 'Bar name too long (max 50 chars)';
    }

    if (!formData.location.trim()) {
      newErrors.location = 'Location required';
    }

    if (formData.closingHour < 0 || formData.closingHour > 23) {
      newErrors.closingHour = 'Closing hour must be 0-23';
    }

    if (formData.contact && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.contact)) {
      newErrors.contact = 'Invalid email format';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    setLoading(true);
    try {
      // Save form data to context
      updateStepData(OnboardingStep.OWNER_BAR_DETAILS, formData);
      completeStep(OnboardingStep.OWNER_BAR_DETAILS, formData);

      // Move to next step
      nextStep();
    } catch (error) {
      console.error('Error saving bar details:', error);
      setErrors({ submit: 'Failed to save bar details' });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: name === 'closingHour' ? parseInt(value, 10) : value,
    }));

    // Clear error for this field
    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-4">
      <div className="bg-white rounded-lg shadow-md p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Let's set up your bar</h1>
          <p className="mt-2 text-gray-600">
            Start with your basic bar information. You can edit this later.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Bar Name */}
          <div>
            <label htmlFor="barName" className="block text-sm font-medium text-gray-700 mb-1">
              Bar Name *
            </label>
            <input
              id="barName"
              name="barName"
              type="text"
              value={formData.barName}
              onChange={handleChange}
              placeholder="e.g., Chez Ali"
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:outline-none ${
                errors.barName
                  ? 'border-red-500 focus:ring-red-200'
                  : 'border-gray-300 focus:ring-blue-200'
              }`}
            />
            {errors.barName && (
              <p className="mt-1 text-sm text-red-600">{errors.barName}</p>
            )}
          </div>

          {/* Location */}
          <div>
            <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-1">
              Location *
            </label>
            <input
              id="location"
              name="location"
              type="text"
              value={formData.location}
              onChange={handleChange}
              placeholder="e.g., Cotonou, Benin"
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:outline-none ${
                errors.location
                  ? 'border-red-500 focus:ring-red-200'
                  : 'border-gray-300 focus:ring-blue-200'
              }`}
            />
            {errors.location && (
              <p className="mt-1 text-sm text-red-600">{errors.location}</p>
            )}
          </div>

          {/* Contact Email */}
          <div>
            <label htmlFor="contact" className="block text-sm font-medium text-gray-700 mb-1">
              Contact Email (optional)
            </label>
            <input
              id="contact"
              name="contact"
              type="email"
              value={formData.contact}
              onChange={handleChange}
              placeholder="your@email.com"
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:outline-none ${
                errors.contact
                  ? 'border-red-500 focus:ring-red-200'
                  : 'border-gray-300 focus:ring-blue-200'
              }`}
            />
            {errors.contact && (
              <p className="mt-1 text-sm text-red-600">{errors.contact}</p>
            )}
          </div>

          {/* Closing Hour */}
          <div>
            <label htmlFor="closingHour" className="block text-sm font-medium text-gray-700 mb-1">
              Closing Hour (Business Day Start) *
            </label>
            <select
              id="closingHour"
              name="closingHour"
              value={formData.closingHour}
              onChange={handleChange}
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:outline-none ${
                errors.closingHour
                  ? 'border-red-500 focus:ring-red-200'
                  : 'border-gray-300 focus:ring-blue-200'
              }`}
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>
                  {i}:00 (closes at {i}:00 AM)
                </option>
              ))}
            </select>
            <p className="mt-2 text-sm text-gray-500">
              ℹ️ Sales before your closing hour are counted as yesterday's date
            </p>
            {errors.closingHour && (
              <p className="mt-1 text-sm text-red-600">{errors.closingHour}</p>
            )}
          </div>

          {/* Operating Mode */}
          <div>
            <label htmlFor="operatingMode" className="block text-sm font-medium text-gray-700 mb-1">
              Operating Mode *
            </label>
            <select
              id="operatingMode"
              name="operatingMode"
              value={formData.operatingMode}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-200 focus:outline-none"
            >
              <option value="simplifié">Simplifié (no user accounts, names only)</option>
              <option value="full">Full (user accounts for each server)</option>
            </select>
            <p className="mt-2 text-sm text-gray-500">
              💡 You can change this later if needed
            </p>
          </div>

          {/* Error Message */}
          {errors.submit && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700">{errors.submit}</p>
            </div>
          )}

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
