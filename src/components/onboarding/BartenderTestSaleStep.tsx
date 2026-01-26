import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOnboarding, OnboardingStep } from '../../context/OnboardingContext';
import { LoadingButton } from '../ui/LoadingButton';

export const BartenderTestSaleStep: React.FC = () => {
  const navigate = useNavigate();
  const { completeStep, completeOnboarding } = useOnboarding();
  const [loading, setLoading] = useState(false);

  const handleFinish = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      completeStep(OnboardingStep.BARTENDER_TEST_SALE, {
        timestamp: new Date().toISOString(),
      });

      completeOnboarding();
      navigate('/dashboard', { replace: true });
    } catch (error) {
      console.error('Error finishing onboarding:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-4">
      <div className="bg-white rounded-lg shadow-md p-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="text-5xl mb-4">🎉</div>
          <h1 className="text-3xl font-bold text-gray-900">Vous êtes prêt !</h1>
          <p className="mt-2 text-gray-600">
            Commencez à enregistrer vos ventes dès maintenant
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleFinish} className="space-y-6">
          {/* Ready to Work */}
          <div className="p-6 bg-green-50 border border-green-200 rounded-lg">
            <h2 className="text-lg font-semibold text-green-900 mb-4">Vous savez maintenant :</h2>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="text-green-600 text-lg">✓</span>
                <span className="text-gray-700">Comment sélectionner des produits</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-green-600 text-lg">✓</span>
                <span className="text-gray-700">Comment confirmer les quantités</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-green-600 text-lg">✓</span>
                <span className="text-gray-700">Comment choisir le mode de paiement</span>
              </div>
            </div>
          </div>

          {/* Next Steps */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="font-medium text-blue-900 mb-2">Prochaines étapes :</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Accédez au tableau de bord</li>
              <li>• Créez votre première vente réelle</li>
              <li>• Consultez vos statistiques personnelles</li>
            </ul>
          </div>

          {/* Info Box */}
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-900">
              💡 <strong>Rappel :</strong> Toutes vos ventes sont suivies individuellement. Vous pouvez consulter vos statistiques à tout moment depuis le tableau de bord.
            </p>
          </div>

          {/* Button */}
          <div className="flex justify-center pt-6 border-t">
            <LoadingButton
              type="submit"
              isLoading={loading}
              loadingText="Lancement..."
              className="px-8 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-semibold"
            >
              Aller au Tableau de Bord
            </LoadingButton>
          </div>
        </form>
      </div>
    </div>
  );
};
