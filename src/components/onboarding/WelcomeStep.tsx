import React from 'react';
import { useOnboarding } from '@/context/OnboardingContext';

/**
 * WelcomeStep
 * First step of onboarding - introduces the user to BarTender
 */
export const WelcomeStep: React.FC = () => {
  const { nextStep } = useOnboarding();

  return (
    <div className="w-full max-w-2xl mx-auto px-4">
      <div className="bg-white rounded-lg shadow-md p-8">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <div className="inline-block mb-4">
            <div className="text-5xl">🍹</div>
          </div>
          <h1 className="text-4xl font-bold text-gray-900">Welcome to BarTender</h1>
          <p className="mt-2 text-gray-600 text-lg">
            Your bar management solution, made simple
          </p>
        </div>

        {/* Intro Text */}
        <div className="mb-8 text-center">
          <p className="text-gray-700 mb-4">
            Let's set up your bar in just a few minutes. We'll guide you through the essential configuration to get you ready for your first sale.
          </p>
        </div>

        {/* Features Preview */}
        <div className="mb-8 space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">What you'll set up:</h2>
          <div className="grid gap-3">
            <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <span className="text-2xl">📍</span>
              <div>
                <p className="font-medium text-gray-900">Bar Details</p>
                <p className="text-sm text-gray-600">Name, location, and hours</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
              <span className="text-2xl">👥</span>
              <div>
                <p className="font-medium text-gray-900">Team Members</p>
                <p className="text-sm text-gray-600">Managers and staff</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
              <span className="text-2xl">🍻</span>
              <div>
                <p className="font-medium text-gray-900">Products</p>
                <p className="text-sm text-gray-600">Your beverage catalog and pricing</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <span className="text-2xl">📦</span>
              <div>
                <p className="font-medium text-gray-900">Inventory</p>
                <p className="text-sm text-gray-600">Initial stock levels</p>
              </div>
            </div>
          </div>
        </div>

        {/* Duration */}
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-center mb-8">
          <p className="text-sm text-gray-700">
            <strong>⏱️ Takes about 3-5 minutes</strong>
          </p>
        </div>

        {/* CTA Button */}
        <div className="flex justify-center">
          <button
            onClick={nextStep}
            className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold text-lg"
          >
            Get Started
          </button>
        </div>
      </div>
    </div>
  );
};
