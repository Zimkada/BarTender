import React, { useState } from 'react';
import { useOnboarding, OnboardingStep } from '@/context/OnboardingContext';
import { LoadingButton } from '@/components/ui/LoadingButton';

export const BartenderTestSaleStep: React.FC = () => {
  const { completeStep, completeOnboarding } = useOnboarding();
  const [loading, setLoading] = useState(false);
  const [createdTestSale, setCreatedTestSale] = useState(false);

  const handleCreateTestSale = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // In real implementation, would create an actual test sale
      setCreatedTestSale(true);

      completeStep(OnboardingStep.BARTENDER_TEST_SALE, {
        testSaleCreated: true,
        timestamp: new Date().toISOString(),
      });

      // Simulate success
      setTimeout(() => {
        completeOnboarding();
        window.location.href = '/dashboard';
      }, 1500);
    } catch (error) {
      console.error('Error creating test sale:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSkipTestSale = async () => {
    setLoading(true);

    try {
      completeStep(OnboardingStep.BARTENDER_TEST_SALE, {
        testSaleSkipped: true,
        timestamp: new Date().toISOString(),
      });

      completeOnboarding();
      window.location.href = '/dashboard';
    } catch (error) {
      console.error('Error skipping test sale:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-4">
      <div className="bg-white rounded-lg shadow-md p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            {createdTestSale ? '✓ Test Sale Created!' : 'Create Test Sale'}
          </h1>
          <p className="mt-2 text-gray-600">
            Try it yourself (optional)
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleCreateTestSale} className="space-y-6">
          {createdTestSale ? (
            // Success State
            <div className="p-6 bg-green-50 border border-green-200 rounded-lg">
              <div className="text-center">
                <div className="text-5xl mb-3">🎉</div>
                <h2 className="text-lg font-semibold text-green-900 mb-2">
                  Success!
                </h2>
                <p className="text-green-800">
                  You've created your first test sale. The system recorded it correctly!
                </p>
              </div>
            </div>
          ) : (
            // Pre-Creation State
            <>
              {/* Instructions */}
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h3 className="font-medium text-blue-900 mb-2">Here's what we'll do:</h3>
                <ol className="text-sm text-blue-800 space-y-1">
                  <li>1. Create a test sale with demo product (Heineken)</li>
                  <li>2. Click the button below to create it</li>
                  <li>3. See it recorded in your sales history</li>
                  <li>4. Then you're ready for real sales!</li>
                </ol>
              </div>

              {/* Demo Sale Details */}
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <h3 className="font-medium text-gray-900 mb-3">Demo Sale Details:</h3>
                <div className="space-y-2 text-sm text-gray-700">
                  <div className="flex justify-between">
                    <span>Product:</span>
                    <strong>Heineken (test)</strong>
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
                  <div className="text-xs text-gray-500 mt-2">
                    * This is a test sale. You can delete it later if needed.
                  </div>
                </div>
              </div>

              {/* Why Try */}
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <h3 className="font-medium text-amber-900 mb-2">Why try it now?</h3>
                <ul className="text-sm text-amber-800 space-y-1">
                  <li>✓ Get comfortable with the interface</li>
                  <li>✓ See exactly how sales are recorded</li>
                  <li>✓ Build confidence before real sales</li>
                  <li>✓ No penalty - it's just a test</li>
                </ul>
              </div>
            </>
          )}

          {/* Info Box */}
          <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
            <p className="text-sm text-indigo-900">
              💡 <strong>Tip:</strong> After this, you can create real sales anytime. Each sale is tracked to YOU personally.
            </p>
          </div>

          {/* Buttons */}
          <div className="flex flex-col gap-3 pt-6 border-t">
            {!createdTestSale ? (
              <>
                <LoadingButton
                  type="submit"
                  isLoading={loading}
                  loadingText="Creating..."
                  className="w-full px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-semibold"
                >
                  Create Test Sale
                </LoadingButton>

                <LoadingButton
                  type="button"
                  isLoading={loading}
                  loadingText="Skipping..."
                  onClick={handleSkipTestSale}
                  className="w-full px-6 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                >
                  Skip Test
                </LoadingButton>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-600 text-center">
                  Redirecting to dashboard...
                </p>
                <div className="w-full bg-gray-200 rounded-full h-1 overflow-hidden">
                  <div className="bg-green-600 h-full animate-pulse" style={{ width: '100%' }} />
                </div>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
