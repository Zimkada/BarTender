// Language: French (Français)
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOnboarding, OnboardingStep } from '../../context/OnboardingContext';
import { useAuth } from '../../context/AuthContext';
import { useBar } from '../../context/BarContext';
import { LoadingButton } from '../ui/LoadingButton';
import { OnboardingService } from '../../services/supabase/onboarding.service';
import { supabase } from '../../lib/supabase';
import { formatAddress } from '../../utils/stringFormatting';


export const ReviewStep: React.FC = () => {
  const navigate = useNavigate();
  const { currentSession } = useAuth();
  const { currentBar } = useBar();
  const { stepData, completeOnboarding, goToStep, previousStep } = useOnboarding();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string>('');

  // Real-time data from database (more reliable than stepData)
  const [realData, setRealData] = useState({
    managerCount: 0,
    staffCount: 0,
    productNames: [] as string[],
    totalStock: 0,
  });

  // Load real data from database
  useEffect(() => {
    if (!currentBar?.id) return;

    const loadRealData = async () => {
      try {
        // Get managers count
        const { count: managersCount } = await supabase
          .from('bar_members')
          .select('*', { count: 'exact', head: true })
          .eq('bar_id', currentBar.id)
          .eq('role', 'gérant')
          .eq('is_active', true);

        // Get staff count
        const { count: staffCount } = await supabase
          .from('bar_members')
          .select('*', { count: 'exact', head: true })
          .eq('bar_id', currentBar.id)
          .eq('role', 'serveur')
          .eq('is_active', true);

        // Get products with display_name (works for both global and local products)
        const { data: barProducts } = await supabase
          .from('bar_products')
          .select('id, display_name, stock')
          .eq('bar_id', currentBar.id)
          .eq('is_active', true);

        // Use display_name for all products
        const productNames = barProducts?.map((p: any) =>
          p.display_name || 'Produit inconnu'
        ) || [];

        // Get total stock from bar_products (current physical stock)
        const totalStock = barProducts?.reduce((sum, p: any) => sum + (p.stock || 0), 0) || 0;

        setRealData({
          managerCount: managersCount || 0,
          staffCount: staffCount || 0,
          productNames,
          totalStock,
        });
      } catch (error) {
        console.error('Failed to load real data:', error);
      }
    };

    loadRealData();
  }, [currentBar?.id]);

  // Gather all step data for summary
  const barDetails = stepData[OnboardingStep.OWNER_BAR_DETAILS] as any;

  const handleLaunch = async (e: React.FormEvent) => {
    e.preventDefault();
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

      /**
       * REFACTORED ARCHITECTURE: Redirect-based onboarding with atomic completion
       *
       * NEW APPROACH (Config-Driven):
       * - All configuration done in real business pages (not onboarding duplicates):
       *   * Managers: Added via /team page (TeamManagementPage)
       *   * Staff: Created via /team page (TeamManagementPage)
       *   * Products: Added via /inventory page (InventoryPage)
       *   * Stock: Initialized via /inventory page (InventoryPage)
       *   * Mode: Set in BarDetailsStep.handleSubmit()
       * - Auto-detection via OnboardingCompletionService (polling 5s)
       * - Zero code duplication (1,205 lines removed)
       *
       * ATOMIC RPC TRANSACTION:
       * - Uses complete_bar_onboarding() RPC for atomic transaction
       * - All verification + mode update + launch in one DB call
       * - Prevents partial failures and improves performance
       *
       * Benefits:
       * - Single DB roundtrip vs 3 separate calls (better performance)
       * - Atomic: All succeed or all fail (no partial setup)
       * - Easier debugging: Single log entry for entire completion
       */

      // ATOMIC COMPLETION: All verification, mode update, and launch in one RPC call
      const finalMode = barDetails?.operatingMode || currentBar?.settings?.operatingMode || 'simplifié';

      // Use the actual bar owner's ID for the RPC verification, 
      // as the RPC strictly checks bar.owner_id = p_owner_id.
      // Since RLS allows managers to update the bar, this is a safe way to reuse the RPC.
      const ownerIdForRpc = currentBar?.ownerId || userId;

      const result = await OnboardingService.completeBarOnboardingAtomic(
        barId,
        ownerIdForRpc,
        finalMode
      );

      if (!result.success) {
        throw new Error(result.error || 'Impossible de compléter l\'intégration');
      }

      // Mark as complete in context
      await completeOnboarding();

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
        <div className="mb-8 p-6 md:p-8">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Prêt à Lancer ?</h1>
          <p className="mt-2 text-sm md:text-base text-gray-600">
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
                  <p className="text-lg font-semibold text-gray-900">{barDetails?.barName || currentBar?.name || 'N/A'}</p>
                </div>
                <span className="text-2xl">✓</span>
              </div>

              <hr className="border-green-200" />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-gray-600">Localisation</p>
                  <p className="text-sm text-gray-900">{formatAddress(barDetails?.location || currentBar?.address || 'N/A')}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-600">Mode</p>
                  <p className="text-sm text-gray-900 capitalize">{barDetails?.operatingMode || currentBar?.settings?.operatingMode || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-600">Heure de Fermeture</p>
                  <p className="text-sm text-gray-900">{(barDetails?.closingHour ?? currentBar?.closingHour) || 6}:00 du matin</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-600">Contact</p>
                  <p className="text-sm text-gray-900">{barDetails?.contact || currentBar?.phone || 'Non fourni'}</p>
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
                <p className="text-xs text-gray-600">{realData.managerCount} compte(s)</p>
              </div>
              <div className="flex items-center gap-2">
                {realData.managerCount > 0 ? (
                  <span className="text-green-600 font-bold">✓</span>
                ) : (
                  <span className="text-gray-300 transform scale-75">○</span>
                )}
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
                  {realData.staffCount > 0 ? `${realData.staffCount} serveur(s)` : 'Dynamique (mode simplifié)'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {realData.staffCount > 0 ? (
                  <span className="text-green-600 font-bold">✓</span>
                ) : (
                  <span className="text-amber-500 font-bold" title="Aucun serveur ajouté">⚠️</span>
                )}
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
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">Produits</p>
                <p className="text-xs text-gray-600">{realData.productNames.length} produit(s)</p>
                {realData.productNames.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {realData.productNames.map((name, idx) => (
                      <span key={idx} className="inline-block px-2 py-0.5 bg-white border border-gray-200 rounded text-xs text-gray-700">
                        {name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {realData.productNames.length > 0 ? (
                  <span className="text-green-600 font-bold">✓</span>
                ) : (
                  <span className="text-red-500 font-bold" title="Aucun produit">✕</span>
                )}
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
                <p className="text-xs text-gray-600">{realData.totalStock} unité(s) au total</p>
              </div>
              <div className="flex items-center gap-2">
                {realData.totalStock > 0 ? (
                  <span className="text-green-600 font-bold">✓</span>
                ) : (
                  <span className="text-amber-500 font-bold" title="Stock vide">⚠️</span>
                )}
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

          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-900">
              💡 <strong>Conseil :</strong> Besoin d'aide une fois lancé ? Cliquez sur le bouton bleu <strong>Guide (?)</strong> situé en haut à droite des pages pour des visites guidées interactives.
            </p>
          </div>

          {/* Error Message */}
          {errors && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700">{errors}</p>
            </div>
          )}

          {/* Buttons - Responsive Layout */}
          <div className="pt-6 border-t space-y-3">
            {/* Mobile: Retour + Lancer sur la même ligne */}
            {/* Footer Actions Standardisé */}
            <div className="flex flex-col sm:flex-row gap-3 mt-8 pt-6 border-t border-gray-100 items-center justify-between">
              <button
                type="button"
                onClick={previousStep}
                className="text-gray-500 hover:text-gray-700 font-medium text-sm px-4 py-2 rounded-lg hover:bg-gray-50 transition"
              >
                Retour
              </button>

              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                className="text-gray-400 hover:text-gray-600 font-medium text-sm underline decoration-gray-300 underline-offset-4 px-4 py-2"
              >
                Compléter plus tard
              </button>

              <LoadingButton
                type="submit"
                isLoading={loading}
                loadingText="Lancement..."
                className="px-8 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-bold shadow-md transform hover:scale-105"
              >
                🚀 Lancer le Bar
              </LoadingButton>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
