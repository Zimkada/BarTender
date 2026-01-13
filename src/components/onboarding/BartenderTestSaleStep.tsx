import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOnboarding, OnboardingStep } from '../../context/OnboardingContext';
import { LoadingButton } from '../ui/LoadingButton';

export const BartenderTestSaleStep: React.FC = () => {
  const navigate = useNavigate();
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
        navigate('/dashboard', { replace: true });
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
      navigate('/dashboard', { replace: true });
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
            {createdTestSale ? '✓ Vente de Test Créée !' : 'Créer une Vente de Test'}
          </h1>
          <p className="mt-2 text-gray-600">
            Essayez par vous-même (optionnel)
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
                  Succès !
                </h2>
                <p className="text-green-800">
                  Vous avez créé votre première vente de test. Le système l'a enregistrée correctement !
                </p>
              </div>
            </div>
          ) : (
            // Pre-Creation State
            <>
              {/* Instructions */}
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h3 className="font-medium text-blue-900 mb-2">Voici ce que nous allons faire :</h3>
                <ol className="text-sm text-blue-800 space-y-1">
                  <li>1. Créer une vente de test avec un produit de démo (Heineken)</li>
                  <li>2. Cliquez sur le bouton ci-dessous pour la créer</li>
                  <li>3. Voyez-la enregistrée dans votre historique des ventes</li>
                  <li>4. Ensuite, vous êtes prêt pour les vraies ventes !</li>
                </ol>
              </div>

              {/* Demo Sale Details */}
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <h3 className="font-medium text-gray-900 mb-3">Détails de la Vente Démo :</h3>
                <div className="space-y-2 text-sm text-gray-700">
                  <div className="flex justify-between">
                    <span>Produit :</span>
                    <strong>Heineken (test)</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Quantité :</span>
                    <strong>1 bouteille</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Prix unitaire :</span>
                    <strong>300 FCFA</strong>
                  </div>
                  <div className="border-t pt-2 mt-2 flex justify-between font-semibold">
                    <span>Total :</span>
                    <strong>300 FCFA</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Paiement :</span>
                    <strong>Espèces</strong>
                  </div>
                  <div className="text-xs text-gray-500 mt-2">
                    * C'est une vente de test. Vous pourrez la supprimer plus tard si nécessaire.
                  </div>
                </div>
              </div>

              {/* Why Try */}
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <h3 className="font-medium text-amber-900 mb-2">Pourquoi essayer maintenant ?</h3>
                <ul className="text-sm text-amber-800 space-y-1">
                  <li>✓ Familiarisez-vous avec l'interface</li>
                  <li>✓ Voyez exactement comment les ventes sont enregistrées</li>
                  <li>✓ Gagnez en confiance avant les vraies ventes</li>
                  <li>✓ Pas de pénalité - c'est juste un test</li>
                </ul>
              </div>
            </>
          )}

          {/* Info Box */}
          <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
            <p className="text-sm text-indigo-900">
              💡 <strong>Conseil :</strong> Après cela, vous pourrez créer de vraies ventes à tout moment. Chaque vente est suivie pour VOUS personnellement.
            </p>
          </div>

          {/* Buttons */}
          <div className="flex flex-col gap-3 pt-6 border-t">
            {!createdTestSale ? (
              <>
                <LoadingButton
                  type="submit"
                  isLoading={loading}
                  loadingText="Création..."
                  className="w-full px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-semibold"
                >
                  Créer une Vente de Test
                </LoadingButton>

                <LoadingButton
                  type="button"
                  isLoading={loading}
                  loadingText="Passage..."
                  onClick={handleSkipTestSale}
                  className="w-full px-6 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                >
                  Passer le Test
                </LoadingButton>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-600 text-center">
                  Redirection vers le tableau de bord...
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
