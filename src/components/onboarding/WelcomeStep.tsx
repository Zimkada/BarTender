import React from 'react';
import { useOnboarding } from '../../context/OnboardingContext';

/**
 * WelcomeStep
 * First step of onboarding - introduces the user to BarTender
 * Adapts message based on whether bar is already set up (training mode) or not (configuration mode)
 * Language: French (Français)
 */
export const WelcomeStep: React.FC = () => {
  const { nextStep, barIsAlreadySetup, userRole } = useOnboarding();

  // Training mode: Bar is already set up, user just needs to learn the system
  const isTrainingMode = barIsAlreadySetup && (userRole === 'gerant' || userRole === 'serveur' || userRole === 'manager' || userRole === 'bartender');

  if (isTrainingMode) {
    return (
      <div className="w-full max-w-2xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-md p-8">
          {/* Logo/Header */}
          <div className="text-center mb-8">
            <div className="inline-block mb-4">
              <div className="text-5xl">🎓</div>
            </div>
            <h1 className="text-4xl font-bold text-gray-900">Bienvenue dans l'Académie BarTender</h1>
            <p className="mt-2 text-gray-600 text-lg">
              Formation rapide pour maîtriser l'application
            </p>
          </div>

          {/* Intro Text */}
          <div className="mb-8 text-center">
            <p className="text-gray-700 mb-4">
              Le bar est déjà configuré ! Nous allons vous montrer comment utiliser l'application efficacement dans votre rôle quotidien.
            </p>
          </div>

          {/* Features Preview */}
          <div className="mb-8 space-y-3">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Ce que vous allez apprendre :</h2>
            <div className="grid gap-3">
              <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <span className="text-2xl">🎯</span>
                <div>
                  <p className="font-medium text-gray-900">Votre rôle</p>
                  <p className="text-sm text-gray-600">Comprendre vos responsabilités</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                <span className="text-2xl">🖥️</span>
                <div>
                  <p className="font-medium text-gray-900">Interface</p>
                  <p className="text-sm text-gray-600">Navigation et fonctionnalités clés</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                <span className="text-2xl">⚡</span>
                <div>
                  <p className="font-medium text-gray-900">Simulation pratique</p>
                  <p className="text-sm text-gray-600">Exercices interactifs pour vous entraîner</p>
                </div>
              </div>
            </div>
          </div>

          {/* Duration */}
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-center mb-8">
            <p className="text-sm text-gray-700">
              <strong>⏱️ Formation rapide : 2-3 minutes</strong>
            </p>
          </div>

          {/* CTA Button */}
          <div className="flex flex-col sm:flex-row gap-3 mt-8 pt-6 border-t border-gray-100 items-center justify-between">
            <div className="w-20"></div>

            <button
              onClick={() => {
                window.location.href = '/dashboard';
              }}
              className="text-gray-400 hover:text-gray-600 font-medium text-sm underline decoration-gray-300 underline-offset-4 px-4 py-2"
            >
              Passer la formation
            </button>

            <button
              onClick={nextStep}
              className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold text-lg shadow-md"
            >
              Commencer la formation
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Configuration mode: Original welcome for new bar setup
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
        <div className="flex flex-col sm:flex-row gap-3 mt-8 pt-6 border-t border-gray-100 items-center justify-between">
          <div className="w-20"></div>

          <button
            onClick={() => {
              window.location.href = '/dashboard';
            }}
            className="text-gray-400 hover:text-gray-600 font-medium text-sm underline decoration-gray-300 underline-offset-4 px-4 py-2"
          >
            Compléter plus tard
          </button>

          <button
            onClick={nextStep}
            className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold text-lg shadow-md"
          >
            Commencer
          </button>
        </div>
      </div>
    </div>
  );
};
