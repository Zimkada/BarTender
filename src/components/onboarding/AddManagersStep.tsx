// Language: French (Français)
import React, { useState } from 'react';
import { useOnboarding, OnboardingStep } from '../../context/OnboardingContext';
import { useAuth } from '../../context/AuthContext';
import { useBar } from '../../context/BarContext';
import { LoadingButton } from '../ui/LoadingButton';
import { OnboardingService } from '../../services/supabase/onboarding.service';
import { ManagerSearchModal } from './modals/ManagerSearchModal';

interface AddManagersFormData {
  managerIds: string[];
}

export const AddManagersStep: React.FC = () => {
  const { currentSession } = useAuth();
  const { currentBar } = useBar();
  const { stepData, updateStepData, completeStep, nextStep, previousStep } = useOnboarding();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string>('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Initialize form with saved data
  const savedData = stepData[OnboardingStep.OWNER_ADD_MANAGERS] as AddManagersFormData | undefined;
  const [formData, setFormData] = useState<AddManagersFormData>({
    managerIds: savedData?.managerIds || [],
  });

  const handleAddManager = () => {
    setIsModalOpen(true);
  };

  const handleModalConfirm = (managerIds: string[]) => {
    const newManagerIds = Array.from(new Set([...formData.managerIds, ...managerIds]));
    setFormData({ managerIds: newManagerIds });
    setIsModalOpen(false);
  };

  const handleRemoveManager = (managerId: string) => {
    setFormData((prev) => ({
      managerIds: prev.managerIds.filter((id) => id !== managerId),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors('');

    setLoading(true);
    try {
      if (!currentSession?.userId) {
        throw new Error('Utilisateur non authentifié');
      }

      if (!currentBar?.id) {
        throw new Error('Bar non trouvé');
      }

      const userId = currentSession.userId;
      const barId = currentBar.id;

      // Assign each manager via API (will be called again in ReviewStep, but also saved here)
      if (formData.managerIds && formData.managerIds.length > 0) {
        for (const managerId of formData.managerIds) {
          // Verify manager exists before assigning
          // (In real impl, would check if user exists)
          try {
            await OnboardingService.assignManager(managerId, barId, userId);
          } catch (error: any) {
            console.warn(`Impossible d'assigner le gérant ${managerId}:`, error);
            // Continue with next manager - don't fail the whole step
          }
        }
      }

      // Save form data to context
      updateStepData(OnboardingStep.OWNER_ADD_MANAGERS, formData);
      completeStep(OnboardingStep.OWNER_ADD_MANAGERS, formData);

      // Move to next step
      nextStep();
    } catch (error: any) {
      console.error('Erreur lors de l\'enregistrement des gérants:', error);
      setErrors(error.message || 'Impossible d\'enregistrer les gérants');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-4">
      <div className="bg-white rounded-lg shadow-md p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Ajouter des Membres d'Équipe</h1>
          <p className="mt-2 text-gray-600">
            Les gérants vous aident à gérer le bar. Vous pouvez toujours en ajouter plus tard.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Manager Count */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm font-medium text-blue-900">
              Gérants actuels : <strong>{formData.managerIds.length}</strong>
            </p>
            {formData.managerIds.length === 0 && (
              <p className="mt-2 text-sm text-orange-700">
                ⚠️ Recommandé : Ajouter au moins 1 gérant (optionnel)
              </p>
            )}
          </div>

          {/* Manager List */}
          {formData.managerIds.length > 0 && (
            <div className="space-y-2">
              {formData.managerIds.map((managerId) => (
                <div
                  key={managerId}
                  className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg"
                >
                  <span className="text-sm text-gray-900">Gérant : {managerId}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveManager(managerId)}
                    className="text-red-600 hover:text-red-700 text-sm font-medium"
                  >
                    Supprimer
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add Manager Button */}
          <button
            type="button"
            onClick={handleAddManager}
            className="w-full px-4 py-3 border border-dashed border-blue-300 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition font-medium"
          >
            + Ajouter un Gérant
          </button>

          {/* Info Box */}
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <h3 className="text-sm font-medium text-gray-900 mb-2">Responsabilités du gérant :</h3>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>✓ Créer des ventes</li>
              <li>✓ Gérer l'inventaire</li>
              <li>✓ Afficher les statistiques</li>
              <li>✗ Impossible de gérer l'équipe</li>
              <li>✗ Impossible de modifier les paramètres</li>
            </ul>
          </div>

          {/* Error Message */}
          {errors && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700">{errors}</p>
            </div>
          )}

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
              loadingText="Enregistrement..."
              className="ml-auto px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              Étape Suivante
            </LoadingButton>
          </div>
        </form>
      </div>

      {/* Manager Search Modal */}
      <ManagerSearchModal
        isOpen={isModalOpen}
        onConfirm={handleModalConfirm}
        onCancel={() => setIsModalOpen(false)}
        selectedIds={formData.managerIds}
      />
    </div>
  );
};
