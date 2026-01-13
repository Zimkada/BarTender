// Language: French (Français)
import React, { useState } from 'react';
import { useOnboarding, OnboardingStep } from '../../context/OnboardingContext';
import { LoadingButton } from '../ui/LoadingButton';

export const ManagerRoleConfirmStep: React.FC = () => {
  const { stepData, completeStep, nextStep, previousStep } = useOnboarding();
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
          <h1 className="text-3xl font-bold text-gray-900">Bienvenue, Gérant !</h1>
          <p className="mt-2 text-gray-600">
            Vous avez été ajouté au bar <strong>{barName}</strong>
          </p>
        </div>

        {/* Role Overview */}
        <form onSubmit={handleConfirm} className="space-y-6">
          <div className="p-6 bg-blue-50 border border-blue-200 rounded-lg">
            <h2 className="text-lg font-semibold text-blue-900 mb-4">Votre Rôle : Gérant</h2>

            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <span className="text-green-600 text-lg">✓</span>
                <div>
                  <p className="font-medium text-gray-900">Créer des Ventes</p>
                  <p className="text-sm text-gray-700">Enregistrer les transactions, appliquer les promotions</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="text-green-600 text-lg">✓</span>
                <div>
                  <p className="font-medium text-gray-900">Gérer l'Inventaire</p>
                  <p className="text-sm text-gray-700">Suivre le stock, définir des alertes, enregistrer les approvisionnements</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="text-green-600 text-lg">✓</span>
                <div>
                  <p className="font-medium text-gray-900">Voir les Analytiques</p>
                  <p className="text-sm text-gray-700">Ventes quotidiennes, top produits, performance de l'équipe</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="text-gray-400 text-lg">✗</span>
                <div>
                  <p className="font-medium text-gray-900">Gérer l'Équipe</p>
                  <p className="text-sm text-gray-700">Seul le propriétaire peut ajouter/supprimer des membres</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="text-gray-400 text-lg">✗</span>
                <div>
                  <p className="font-medium text-gray-900">Modifier les Paramètres</p>
                  <p className="text-sm text-gray-700">Le propriétaire contrôle la configuration du bar</p>
                </div>
              </div>
            </div>
          </div>

          {/* Next Steps */}
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <h3 className="font-medium text-gray-900 mb-3">Prochaines étapes :</h3>
            <ol className="text-sm text-gray-700 space-y-2">
              <li className="flex gap-2">
                <span className="font-semibold text-gray-900 w-6">1.</span>
                <span>Tour rapide du tableau de bord</span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-gray-900 w-6">2.</span>
                <span>Apprendre à créer votre première vente</span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-gray-900 w-6">3.</span>
                <span>Commencer à travailler !</span>
              </li>
            </ol>
          </div>

          {/* Info */}
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-900">
              💡 <strong>Conseil :</strong> Besoin d'aide à tout moment ? Cliquez sur le bouton <strong>?</strong> en bas à droite.
            </p>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-6 border-t">
            <button
              type="button"
              onClick={previousStep}
              className="px-6 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              Retour
            </button>
            <LoadingButton
              type="submit"
              isLoading={loading}
              loadingText="Continuation..."
              className="ml-auto px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              J'ai compris
            </LoadingButton>
          </div>
        </form>
      </div>
    </div>
  );
};
