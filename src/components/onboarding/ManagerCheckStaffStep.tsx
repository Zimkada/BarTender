import React, { useState } from 'react';
import { useOnboarding, OnboardingStep } from '../../context/OnboardingContext';
import { LoadingButton } from '../ui/LoadingButton';

export const ManagerCheckStaffStep: React.FC = () => {
  const { stepData, completeStep, nextStep, previousStep } = useOnboarding();
  const [loading, setLoading] = useState(false);

  // Get staff info (set during owner onboarding)
  const staffData = stepData[OnboardingStep.OWNER_SETUP_STAFF] as any;
  const serverCount = staffData?.serverNames?.length || 0;

  const handleContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      completeStep(OnboardingStep.MANAGER_CHECK_STAFF, {
        staffVerified: true,
        timestamp: new Date().toISOString(),
      });
      nextStep();
    } catch (error) {
      console.error('Error confirming staff:', error);
    } finally {
      setLoading(false);
    }
  };

  const hasStaff = serverCount > 0;

  return (
    <div className="w-full max-w-2xl mx-auto px-4">
      <div className="bg-white rounded-lg shadow-md p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Statut de l'Équipe</h1>
          <p className="mt-2 text-gray-600">
            Vérifiez si votre équipe de serveurs est configurée
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleContinue} className="space-y-6">
          {hasStaff ? (
            // Staff exists
            <div className="p-6 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-start gap-4">
                <span className="text-3xl">✓</span>
                <div>
                  <h2 className="text-lg font-semibold text-green-900">Équipe Prête</h2>
                  <p className="mt-1 text-green-800">
                    <strong>{serverCount} serveur(s)</strong> déjà configuré(s) par le propriétaire
                  </p>
                  <div className="mt-3 space-y-1">
                    {staffData?.serverNames?.map((name: string, idx: number) => (
                      <div key={idx} className="text-sm text-green-800">
                        • {name}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            // No staff - contact owner
            <div className="p-6 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-4">
                <span className="text-3xl">⚠️</span>
                <div>
                  <h2 className="text-lg font-semibold text-amber-900">Aucun Serveur</h2>
                  <p className="mt-1 text-amber-800">
                    Le bar est en <strong>Mode Simplifié</strong> ou le propriétaire n'a pas encore ajouté de serveurs.
                  </p>
                  <p className="mt-2 text-sm text-amber-800">
                    💡 <strong>Que faire :</strong> Contactez le propriétaire pour ajouter des serveurs, ou continuez
                    pour créer des ventes (les serveurs peuvent être ajoutés dynamiquement)
                  </p>

                  <button
                    type="button"
                    className="mt-4 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition text-sm font-medium"
                  >
                    Envoyer un message au propriétaire
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Info Box */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="font-medium text-blue-900 mb-2">À propos des serveurs :</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>✓ Chaque serveur suit qui a créé chaque vente</li>
              <li>✓ Métriques de performance personnelles</li>
              <li>✓ Peuvent être ajoutés à tout moment</li>
            </ul>
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
              Continuer
            </LoadingButton>
          </div>
        </form>
      </div>
    </div>
  );
};
