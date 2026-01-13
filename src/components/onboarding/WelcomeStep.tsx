import React from 'react';
import { useOnboarding } from '@/context/OnboardingContext';

/**
 * WelcomeStep
 * First step of onboarding - introduces the user to BarTender
 * Language: French (Français)
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
          <h1 className="text-4xl font-bold text-gray-900">Bienvenue sur BarTender</h1>
          <p className="mt-2 text-gray-600 text-lg">
            Votre solution de gestion de bar, simplifiée
          </p>
        </div>

        {/* Intro Text */}
        <div className="mb-8 text-center">
          <p className="text-gray-700 mb-4">
            Configurons votre bar en quelques minutes. Nous vous guiderons à travers les étapes essentielles pour être prêt pour votre première vente.
          </p>
        </div>

        {/* Features Preview */}
        <div className="mb-8 space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Ce que vous allez configurer :</h2>
          <div className="grid gap-3">
            <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <span className="text-2xl">📍</span>
              <div>
                <p className="font-medium text-gray-900">Détails du bar</p>
                <p className="text-sm text-gray-600">Nom, localisation et horaires</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
              <span className="text-2xl">👥</span>
              <div>
                <p className="font-medium text-gray-900">Équipe</p>
                <p className="text-sm text-gray-600">Gérants et serveurs</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
              <span className="text-2xl">🍻</span>
              <div>
                <p className="font-medium text-gray-900">Produits</p>
                <p className="text-sm text-gray-600">Votre catalogue de boissons et tarification</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <span className="text-2xl">📦</span>
              <div>
                <p className="font-medium text-gray-900">Inventaire</p>
                <p className="text-sm text-gray-600">Niveaux de stock initial</p>
              </div>
            </div>
          </div>
        </div>

        {/* Duration */}
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-center mb-8">
          <p className="text-sm text-gray-700">
            <strong>⏱️ Cela prend environ 3-5 minutes</strong>
          </p>
        </div>

        {/* CTA Button */}
        <div className="flex justify-center">
          <button
            onClick={nextStep}
            className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold text-lg"
          >
            Commencer
          </button>
        </div>
      </div>
    </div>
  );
};
