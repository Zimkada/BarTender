// Language: French (Français)
import React, { useState } from 'react';
import { useOnboarding, OnboardingStep } from '../../context/OnboardingContext';
import { LoadingButton } from '../ui/LoadingButton';

interface SetupStaffFormData {
  serverNames: string[];
}

export const SetupStaffStep: React.FC = () => {
  const { stepData, updateStepData, completeStep, nextStep, previousStep } = useOnboarding();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string>('');
  const [newServerName, setNewServerName] = useState('');

  // Initialize form with saved data
  const savedData = stepData[OnboardingStep.OWNER_SETUP_STAFF] as SetupStaffFormData | undefined;
  const [formData, setFormData] = useState<SetupStaffFormData>({
    serverNames: savedData?.serverNames || [],
  });

  // Check if simplified mode (skip this step)
  const barDetails = stepData[OnboardingStep.OWNER_BAR_DETAILS] as any;
  const isSimplified = barDetails?.operatingMode === 'simplifié';

  const handleAddServer = () => {
    if (!newServerName.trim()) {
      setErrors('Nom du serveur requis');
      return;
    }

    if (newServerName.length > 50) {
      setErrors('Nom du serveur trop long');
      return;
    }

    setFormData((prev) => ({
      serverNames: [...prev.serverNames, newServerName],
    }));
    setNewServerName('');
    setErrors('');
  };

  const handleRemoveServer = (index: number) => {
    setFormData((prev) => ({
      serverNames: prev.serverNames.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoading(true);
    try {
      updateStepData(OnboardingStep.OWNER_SETUP_STAFF, formData);
      completeStep(OnboardingStep.OWNER_SETUP_STAFF, formData);
      nextStep();
    } catch (error) {
      console.error('Erreur lors de l\'enregistrement du personnel:', error);
      setErrors('Impossible d\'enregistrer le personnel');
    } finally {
      setLoading(false);
    }
  };

  // If simplified mode, skip this step automatically
  if (isSimplified) {
    return (
      <div className="w-full max-w-2xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-md p-8">
          <h1 className="text-3xl font-bold text-gray-900">Configurer le Personnel</h1>
          <p className="mt-4 text-gray-600">
            ℹ️ Vous utilisez le <strong>Mode Simplifié</strong>, donc le personnel est ajouté dynamiquement
            par les gérants. Passer cette étape.
          </p>
          <div className="flex gap-3 mt-8 pt-6 border-t">
            <button
              type="button"
              onClick={previousStep}
              className="px-6 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              Retour
            </button>
            <LoadingButton
              type="button"
              isLoading={loading}
              loadingText="Continuation..."
              onClick={async () => {
                setLoading(true);
                try {
                  completeStep(OnboardingStep.OWNER_SETUP_STAFF, { serverNames: [] });
                  nextStep();
                } finally {
                  setLoading(false);
                }
              }}
              className="ml-auto px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              Continuer
            </LoadingButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto px-4">
      <div className="bg-white rounded-lg shadow-md p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Configurer le Personnel</h1>
          <p className="mt-2 text-gray-600">
            Créer des comptes serveur pour vos baristas (Mode Complet)
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Server Count */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm font-medium text-blue-900">
              Serveurs ajoutés : <strong>{formData.serverNames.length}</strong>
            </p>
          </div>

          {/* Server List */}
          {formData.serverNames.length > 0 && (
            <div className="space-y-2">
              {formData.serverNames.map((serverName, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg"
                >
                  <span className="text-sm text-gray-900">{serverName}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveServer(index)}
                    className="text-red-600 hover:text-red-700 text-sm font-medium"
                  >
                    Supprimer
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add Server Input */}
          <div className="space-y-2">
            <label htmlFor="serverName" className="block text-sm font-medium text-gray-700">
              Nom du Serveur
            </label>
            <div className="flex gap-2">
              <input
                id="serverName"
                type="text"
                value={newServerName}
                onChange={(e) => {
                  setNewServerName(e.target.value);
                  setErrors('');
                }}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddServer();
                  }
                }}
                placeholder="ex : Ahmed, Youssouf"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-200 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddServer}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
              >
                Ajouter
              </button>
            </div>
          </div>

          {/* Error Message */}
          {errors && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700">{errors}</p>
            </div>
          )}

          {/* Info Box */}
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <h3 className="text-sm font-medium text-gray-900 mb-2">Pourquoi ajouter des serveurs maintenant ?</h3>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>✓ Chaque serveur a son propre compte</li>
              <li>✓ Suivre qui a créé chaque vente</li>
              <li>✓ Métriques de performance personnelles</li>
              <li>💡 Vous pouvez ajouter plus de serveurs plus tard</li>
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
              loadingText="Enregistrement..."
              className="ml-auto px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              Étape Suivante
            </LoadingButton>
          </div>
        </form>
      </div>
    </div>
  );
};
