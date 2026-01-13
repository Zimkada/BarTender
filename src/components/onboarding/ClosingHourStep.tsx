// Language: French (Français)
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
      console.error('Erreur lors de la confirmation de l\'heure de fermeture:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-4">
      <div className="bg-white rounded-lg shadow-md p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Confirmer l'Heure de Fermeture</h1>
          <p className="mt-2 text-gray-600">
            Cela définit votre jour ouvrable. Les ventes avant cette heure comptent comme le jour précédent.
          </p>
        </div>

        {/* Current Closing Hour */}
        <form onSubmit={handleConfirm} className="space-y-6">
          <div className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg">
            <h2 className="text-2xl font-bold text-blue-900 mb-2">
              Heure de Fermeture : {closingHour}:00 du matin
            </h2>
            <p className="text-blue-800">
              Votre jour ouvrable se termine à {closingHour}:00 et commence le jour suivant
            </p>
          </div>

          {/* Scenario Examples */}
          <div className="space-y-4">
            <h3 className="font-medium text-gray-900">Scénarios d'exemple :</h3>

            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <p className="font-medium text-gray-900 mb-1">Scénario 1 : Vente à 05:00 du matin (5h du matin)</p>
              <p className="text-sm text-gray-700">
                Heure de fermeture = 6h du matin → La vente est comptée comme <strong>hier</strong>
              </p>
            </div>

            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <p className="font-medium text-gray-900 mb-1">Scénario 2 : Vente à 20:00 (8h du soir)</p>
              <p className="text-sm text-gray-700">
                Heure de fermeture = 6h du matin → La vente est comptée comme <strong>aujourd'hui</strong>
              </p>
            </div>

            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <p className="font-medium text-gray-900 mb-1">Scénario 3 : Vente à 02:00 du matin (2h du matin)</p>
              <p className="text-sm text-gray-700">
                Heure de fermeture = 6h du matin → La vente est comptée comme <strong>hier</strong>
              </p>
            </div>
          </div>

          {/* Info Box */}
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <h3 className="text-sm font-medium text-amber-900 mb-2">Pourquoi c'est important :</h3>
            <ul className="text-sm text-amber-800 space-y-1">
              <li>✓ Comptabilité : les rapports correspondent à votre calendrier financier</li>
              <li>✓ Rapprochement quotidien : date correcte pour les comptages de caisse</li>
              <li>✓ Analyse : ventes groupées par jour ouvrable correct</li>
              <li>💡 Vous avez défini cela à l'étape 1, juste confirmation ici</li>
            </ul>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-6 border-t">
            <button
              type="button"
              onClick={() => window.history.back()}
              className="px-6 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              Retour
            </button>
            <LoadingButton
              type="submit"
              isLoading={loading}
              loadingText="Confirmation..."
              className="ml-auto px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              Confirmer et Continuer
            </LoadingButton>
          </div>
        </form>
      </div>
    </div>
  );
};
