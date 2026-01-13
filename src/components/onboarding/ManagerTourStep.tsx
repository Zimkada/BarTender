import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOnboarding, OnboardingStep } from '../../context/OnboardingContext';
import { LoadingButton } from '../ui/LoadingButton';

export const ManagerTourStep: React.FC = () => {
  const navigate = useNavigate();
  const { completeStep, completeOnboarding } = useOnboarding();
  const [loading, setLoading] = useState(false);

  const handleStartTour = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // In real implementation, would start interactive tour with Shepherd.js
      completeStep(OnboardingStep.MANAGER_TOUR, {
        tourStarted: true,
        timestamp: new Date().toISOString(),
      });

      // Simulate tour completion after 2s
      setTimeout(() => {
        completeOnboarding();
        navigate('/dashboard', { replace: true });
      }, 2000);
    } catch (error) {
      console.error('Error starting tour:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSkipTour = async () => {
    setLoading(true);

    try {
      completeStep(OnboardingStep.MANAGER_TOUR, {
        tourSkipped: true,
        timestamp: new Date().toISOString(),
      });
      completeOnboarding();
      navigate('/dashboard', { replace: true });
    } catch (error) {
      console.error('Error skipping tour:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-4">
      <div className="bg-white rounded-lg shadow-md p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Tour Rapide (Optionnel)</h1>
          <p className="mt-2 text-gray-600">
            Apprenez les bases de la création de ventes et de la gestion de l'inventaire
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleStartTour} className="space-y-6">
          {/* Tour Info */}
          <div className="p-6 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-4">
              <span className="text-3xl">👋</span>
              <div>
                <h2 className="text-lg font-semibold text-blue-900">Présentation de 2 Minutes</h2>
                <p className="mt-2 text-blue-800">
                  Nous vous montrerons :
                </p>
                <ul className="mt-2 text-sm text-blue-800 space-y-1">
                  <li>✓ Aperçu du tableau de bord (KPIs, filtres de date)</li>
                  <li>✓ Comment créer votre première vente</li>
                  <li>✓ Gérer l'inventaire et le stock</li>
                  <li>✓ Voir la performance de l'équipe</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Why Tour */}
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <h3 className="font-medium text-gray-900 mb-2">Pourquoi faire le tour ?</h3>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>💡 Plus rapide que de chercher soi-même</li>
              <li>💡 Apprenez les meilleures pratiques dès le premier jour</li>
              <li>💡 Vous pouvez toujours recommencer le tour plus tard</li>
            </ul>
          </div>

          {/* Tour Demo Preview */}
          <div className="p-4 bg-gray-100 border border-gray-300 rounded-lg text-center">
            <p className="text-gray-600 text-sm">
              [L'aperçu de la visite interactive apparaîtrait ici pendant la visite réelle]
            </p>
            <p className="text-gray-500 text-xs mt-2">La visite utilise des mises en surbrillance guidées + des explications étape par étape</p>
          </div>

          {/* Buttons */}
          <div className="flex flex-col gap-3 pt-6 border-t">
            <LoadingButton
              type="submit"
              isLoading={loading}
              loadingText="Démarrage du tour..."
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold"
            >
              Démarrer le Tour de 2 Min
            </LoadingButton>

            <LoadingButton
              type="button"
              isLoading={loading}
              loadingText="Passage..."
              onClick={handleSkipTour}
              className="w-full px-6 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              Passer pour le Moment
            </LoadingButton>

            <p className="text-xs text-gray-500 text-center">
              💡 Vous pouvez recommencer le tour à tout moment depuis le tableau de bord
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};
