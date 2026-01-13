// Language: French (Français)
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOnboarding, OnboardingStep } from '@/context/OnboardingContext';
import { useAuth } from '@/context/AuthContext';
import { useBar } from '@/context/BarContext';
import { LoadingButton } from '@/components/ui/LoadingButton';
import { OnboardingService } from '@/services/supabase/onboarding.service';

export const ReviewStep: React.FC = () => {
  const navigate = useNavigate();
  const { currentSession } = useAuth();
  const { currentBar } = useBar();
  const { stepData, completeOnboarding, goToStep } = useOnboarding();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string>('');

  // Gather all step data for summary
  const barDetails = stepData[OnboardingStep.OWNER_BAR_DETAILS] as any;
  const managers = stepData[OnboardingStep.OWNER_ADD_MANAGERS] as any;
  const staff = stepData[OnboardingStep.OWNER_SETUP_STAFF] as any;
  const products = stepData[OnboardingStep.OWNER_ADD_PRODUCTS] as any;
  const stock = stepData[OnboardingStep.OWNER_STOCK_INIT] as any;

  const managerCount = managers?.managerIds?.length || 0;
  const staffCount = staff?.serverNames?.length || 0;
  const productCount = products?.products?.length || 0;
  const totalStock = Object.values(stock?.stocks || {}).reduce((sum: number, qty: any) => sum + (qty || 0), 0);

  const handleLaunch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!currentSession?.user?.id) {
        throw new Error('Utilisateur non authentifié');
      }

      if (!currentBar?.id) {
        throw new Error('Bar non trouvé');
      }

      const userId = currentSession.user.id;
      const barId = currentBar.id;

      /**
       * PHASE 1 + PHASE 2 FIX: Atomic onboarding completion
       *
       * PHASE 1 (Already Done): Removed duplicate assignments
       * - All data already assigned in their respective steps:
       *   * Managers: Added in AddManagersStep.handleSubmit()
       *   * Staff: Created in SetupStaffStep.handleSubmit()
       *   * Products: Added in AddProductsStep.handleSubmit()
       *   * Stock: Initialized in StockInitStep.handleSubmit()
       *   * Mode: Set in BarDetailsStep.handleSubmit()
       *
       * PHASE 2 (NEW): Single atomic RPC transaction
       * - Uses complete_bar_onboarding() RPC for atomic transaction
       * - All verification + mode update + launch in one DB call
       * - Prevents partial failures and improves performance
       * - Maintains exact same business logic as Phase 1
       *
       * Benefits:
       * - Single DB roundtrip vs 3 separate calls (better performance)
       * - Atomic: All succeed or all fail (no partial setup)
       * - Easier debugging: Single log entry for entire completion
       */

      // ATOMIC COMPLETION: All verification, mode update, and launch in one RPC call
      const result = await OnboardingService.completeBarOnboardingAtomic(
        barId,
        userId,
        barDetails?.operatingMode
      );

      if (!result.success) {
        throw new Error(result.error || 'Impossible de compléter l\'intégration');
      }

      // Mark as complete in context
      completeOnboarding();

      // Redirect to dashboard
      setTimeout(() => {
        navigate('/dashboard', { replace: true });
      }, 500);
    } catch (error: any) {
      console.error('Erreur lors du lancement du bar:', error);
      setErrors(error.message || 'Impossible de lancer le bar. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  const handleEditStep = (step: OnboardingStep) => {
    goToStep(step);
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-4">
      <div className="bg-white rounded-lg shadow-md p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Prêt à Lancer ?</h1>
          <p className="mt-2 text-gray-600">
            Vérifiez votre configuration et lancez votre bar
          </p>
        </div>

        {/* Summary Card */}
        <form onSubmit={handleLaunch} className="space-y-6">
          {/* Bar Info */}
          <div className="p-6 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg">
            <div className="space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-gray-600">Nom du Bar</p>
                  <p className="text-lg font-semibold text-gray-900">{barDetails?.barName || 'N/A'}</p>
                </div>
                <span className="text-2xl">✓</span>
              </div>

              <hr className="border-green-200" />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-gray-600">Localisation</p>
                  <p className="text-sm text-gray-900">{barDetails?.location || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-600">Mode</p>
                  <p className="text-sm text-gray-900 capitalize">{barDetails?.operatingMode || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-600">Heure de Fermeture</p>
                  <p className="text-sm text-gray-900">{barDetails?.closingHour}:00 du matin</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-600">Contact</p>
                  <p className="text-sm text-gray-900">{barDetails?.contact || 'Non fourni'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Checklist */}
          <div className="space-y-3">
            {/* Managers */}
            <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-900">Gérants</p>
                <p className="text-xs text-gray-600">{managerCount} compte(s)</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-green-600">✓</span>
                <button
                  type="button"
                  onClick={() => handleEditStep(OnboardingStep.OWNER_ADD_MANAGERS)}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  Modifier
                </button>
              </div>
            </div>

            {/* Staff */}
            <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-900">Personnel</p>
                <p className="text-xs text-gray-600">
                  {staffCount > 0 ? `${staffCount} serveur(s)` : 'Dynamique (mode simplifié)'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-green-600">✓</span>
                <button
                  type="button"
                  onClick={() => handleEditStep(OnboardingStep.OWNER_SETUP_STAFF)}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  Modifier
                </button>
              </div>
            </div>

            {/* Products */}
            <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-900">Produits</p>
                <p className="text-xs text-gray-600">{productCount} produit(s)</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-green-600">✓</span>
                <button
                  type="button"
                  onClick={() => handleEditStep(OnboardingStep.OWNER_ADD_PRODUCTS)}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  Modifier
                </button>
              </div>
            </div>

            {/* Stock */}
            <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-900">Stock Initial</p>
                <p className="text-xs text-gray-600">{totalStock} unité(s) au total</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-green-600">✓</span>
                <button
                  type="button"
                  onClick={() => handleEditStep(OnboardingStep.OWNER_STOCK_INIT)}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  Modifier
                </button>
              </div>
            </div>
          </div>

          {/* Launch Button */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-900">
              ✨ Une fois lancé, votre bar est prêt pour les ventes ! Les gérants peuvent commencer à créer des transactions.
            </p>
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
              onClick={() => window.history.back()}
              className="px-6 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              Retour
            </button>
            <LoadingButton
              type="submit"
              isLoading={loading}
              loadingText="Lancement..."
              className="ml-auto px-8 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-semibold text-lg"
            >
              🚀 Lancer le Bar
            </LoadingButton>
          </div>
        </form>
      </div>
    </div>
  );
};
