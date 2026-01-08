import React, { useState } from 'react';
import { useOnboarding, OnboardingStep } from '@/context/OnboardingContext';
import { LoadingButton } from '@/components/ui/LoadingButton';

interface AddProductsFormData {
  productIds: string[];
}

export const AddProductsStep: React.FC = () => {
  const { stepData, updateStepData, completeStep, nextStep } = useOnboarding();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string>('');

  // Initialize form with saved data
  const savedData = stepData[OnboardingStep.OWNER_ADD_PRODUCTS] as AddProductsFormData | undefined;
  const [formData, setFormData] = useState<AddProductsFormData>({
    productIds: savedData?.productIds || [],
  });

  const handleOpenProductSelector = () => {
    // This would open a modal to select products from global catalog
    // For now, show placeholder
    alert('Product selector modal would appear here (global catalog)');
  };

  const handleRemoveProduct = (productId: string) => {
    setFormData((prev) => ({
      productIds: prev.productIds.filter((id) => id !== productId),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // HARD BLOCKER: At least 1 product required
    if (formData.productIds.length === 0) {
      setErrors('❌ At least 1 product required. You cannot create sales without products.');
      return;
    }

    setLoading(true);
    try {
      updateStepData(OnboardingStep.OWNER_ADD_PRODUCTS, formData);
      completeStep(OnboardingStep.OWNER_ADD_PRODUCTS, formData);
      nextStep();
    } catch (error) {
      console.error('Error saving products:', error);
      setErrors('Failed to save products');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-4">
      <div className="bg-white rounded-lg shadow-md p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Add Products to Catalog</h1>
          <p className="mt-2 text-gray-600">
            Select products from the global catalog and set local prices.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Product Count */}
          <div className={`p-4 border rounded-lg ${
            formData.productIds.length === 0
              ? 'bg-red-50 border-red-200'
              : 'bg-green-50 border-green-200'
          }`}>
            <p className={`text-sm font-medium ${
              formData.productIds.length === 0
                ? 'text-red-900'
                : 'text-green-900'
            }`}>
              Products added: <strong>{formData.productIds.length}</strong>
            </p>
            {formData.productIds.length === 0 && (
              <p className="mt-1 text-sm text-red-700">
                ⚠️ <strong>REQUIRED:</strong> Add at least 1 product
              </p>
            )}
          </div>

          {/* Product List */}
          {formData.productIds.length > 0 && (
            <div className="space-y-2">
              {formData.productIds.map((productId) => (
                <div
                  key={productId}
                  className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg"
                >
                  <span className="text-sm text-gray-900">Product: {productId}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveProduct(productId)}
                    className="text-red-600 hover:text-red-700 text-sm font-medium"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add Products Button */}
          <button
            type="button"
            onClick={handleOpenProductSelector}
            className="w-full px-4 py-3 border border-dashed border-blue-300 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition font-medium"
          >
            + Browse & Add Products
          </button>

          {/* Info Box */}
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <h3 className="text-sm font-medium text-gray-900 mb-2">What happens next:</h3>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>✓ For each product, you'll set local price</li>
              <li>✓ Then initialize stock (how many units you have)</li>
              <li>✓ Minimum recommendation: 5+ products</li>
            </ul>
          </div>

          {/* Error Message */}
          {errors && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700">{errors}</p>
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
              className="ml-auto px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
              disabled={formData.productIds.length === 0}
            >
              Next Step
            </LoadingButton>
          </div>
        </form>
      </div>
    </div>
  );
};
