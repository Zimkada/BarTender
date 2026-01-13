import React, { useState } from 'react';
import { useOnboarding, OnboardingStep } from '@/context/OnboardingContext';
import { LoadingButton } from '@/components/ui/LoadingButton';

export const BartenderIntroStep: React.FC = () => {
  const { barId, stepData, completeStep, nextStep } = useOnboarding();
  const [loading, setLoading] = useState(false);

  // Get bar name if available
  const barDetails = stepData[OnboardingStep.OWNER_BAR_DETAILS] as any;
  const barName = barDetails?.barName || 'Your Bar';

  const handleUnderstand = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      completeStep(OnboardingStep.BARTENDER_INTRO, {
        timestamp: new Date().toISOString(),
      });
      nextStep();
    } catch (error) {
      console.error('Error confirming intro:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-4">
      <div className="bg-white rounded-lg shadow-md p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Bienvenue chez {barName} ! 🎉</h1>
          <p className="mt-2 text-gray-600">
            Vous avez été ajouté en tant que serveur/barman
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleUnderstand} className="space-y-6">
          {/* Role Overview */}
          <div className="p-6 bg-purple-50 border border-purple-200 rounded-lg">
            <h2 className="text-lg font-semibold text-purple-900 mb-4">Votre Rôle : Serveur/Barman</h2>

            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <span className="text-2xl">🍺</span>
                <div>
                  <p className="font-medium text-gray-900">Mission principale : Créer des Ventes</p>
                  <p className="text-sm text-gray-700">Enregistrer chaque transaction, suivre l'inventaire</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="text-2xl">👥</span>
                <div>
                  <p className="font-medium text-gray-900">Métriques Personnelles</p>
                  <p className="text-sm text-gray-700">Vos ventes sont suivies séparément (statistiques personnelles)</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="text-2xl">📊</span>
                <div>
                  <p className="font-medium text-gray-900">Aperçu de l'Équipe</p>
                  <p className="text-sm text-gray-700">Voir la performance de l'équipe (sans la gérer)</p>
                </div>
              </div>
            </div>
          </div>

          {/* Main Task */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="font-medium text-blue-900 mb-2">Votre travail en 3 étapes :</h3>
            <ol className="text-sm text-blue-800 space-y-2">
              <li className="flex gap-2">
                <span className="font-bold text-blue-900 w-6">1.</span>
                <span><strong>Sélectionner le(s) produit(s)</strong> vendu(s) (bière, snacks, etc.)</span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-blue-900 w-6">2.</span>
                <span><strong>Confirmer la quantité</strong> et le prix total</span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-blue-900 w-6">3.</span>
                <span><strong>Choisir le mode de paiement</strong> (espèces, carte, etc.)</span>
              </li>
            </ol>
          </div>

          {/* Pro Tips */}
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <h3 className="font-medium text-amber-900 mb-2">💡 Conseils de Pro :</h3>
            <ul className="text-sm text-amber-800 space-y-1">
              <li>✓ Gardez des transactions précises pour la comptabilité</li>
              <li>✓ Surveillez les niveaux de stock - signalez quand il est bas</li>
              <li>✓ Des questions ? Demandez à votre gérant ou propriétaire</li>
              <li>✓ Cliquez sur le bouton <strong>?</strong> pour de l'aide à tout moment</li>
            </ul>
          </div>

          {/* Next Steps */}
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <h3 className="font-medium text-gray-900 mb-2">Prochaines étapes :</h3>
            <ol className="text-sm text-gray-700 space-y-2">
              <li className="flex gap-2">
                <span className="font-bold">1.</span>
                <span>Démo rapide de la création d'une vente</span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold">2.</span>
                <span>Essayer de créer votre première vente (test)</span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold">3.</span>
                <span>Vous êtes prêt à travailler !</span>
              </li>
            </ol>
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
              loadingText="Continuation..."
              className="ml-auto px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
            >
              J'ai compris
            </LoadingButton>
          </div>
        </form>
      </div>
    </div>
  );
};
