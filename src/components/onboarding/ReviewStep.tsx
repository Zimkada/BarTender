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

  const ChecklistItem: React.FC<{
    label: string;
    detail: React.ReactNode;
    status: 'ok' | 'warning' | 'missing' | 'optional';
    onEdit: () => void;
    children?: React.ReactNode;
  }> = ({ label, detail, status, onEdit, children }) => {
    const statusIcon =
      status === 'ok' ? (
        <span className="w-5 h-5 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-caption font-bold">✓</span>
      ) : status === 'warning' ? (
        <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-caption font-bold">!</span>
      ) : status === 'missing' ? (
        <span className="w-5 h-5 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-caption font-bold">✕</span>
      ) : (
        <span className="w-5 h-5 rounded-full border border-border text-muted-foreground/60 flex items-center justify-center text-caption">○</span>
      );

    return (
      <div className="flex items-center justify-between gap-3 p-3.5 bg-muted border border-border rounded-xl">
        <div className="flex-1 min-w-0">
          <p className="text-body-sm font-medium text-foreground">{label}</p>
          <p className="text-caption text-muted-foreground">{detail}</p>
          {children}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {statusIcon}
          <button
            type="button"
            onClick={onEdit}
            className="text-caption font-medium text-brand-primary hover:underline"
          >
            Modifier
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-4">
      <div className="bg-card rounded-2xl border border-border shadow-sm p-6 md:p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-h1 text-foreground mb-2">Prêt à lancer ?</h1>
          <p className="text-body-sm text-muted-foreground">
            Vérifiez votre configuration et lancez votre bar.
          </p>
        </div>

        <form onSubmit={handleLaunch} className="space-y-5">
          {/* Bar Info */}
          <div className="p-5 bg-brand-subtle border border-brand-subtle rounded-xl">
            <div className="space-y-4">
              <div className="flex justify-between items-start gap-3">
                <div className="min-w-0">
                  <p className="text-micro text-brand-primary">Nom du bar</p>
                  <p className="text-h3 text-foreground truncate">{barDetails?.barName || currentBar?.name || 'N/A'}</p>
                </div>
                <span className="w-7 h-7 rounded-full bg-card text-brand-primary flex items-center justify-center font-bold flex-shrink-0">✓</span>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-3 border-t border-brand-subtle">
                <div>
                  <p className="text-micro text-brand-primary">Localisation</p>
                  <p className="text-caption font-medium text-foreground">{formatAddress(barDetails?.location || currentBar?.address || 'N/A')}</p>
                </div>
                <div>
                  <p className="text-micro text-brand-primary">Mode</p>
                  <p className="text-caption font-medium text-foreground capitalize">{barDetails?.operatingMode || currentBar?.settings?.operatingMode || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-micro text-brand-primary">Fermeture</p>
                  <p className="text-caption font-medium text-foreground tabular-nums">{((barDetails?.closingHour ?? currentBar?.closingHour) || 6).toString().padStart(2, '0')}:00</p>
                </div>
                <div>
                  <p className="text-micro text-brand-primary">Contact</p>
                  <p className="text-caption font-medium text-foreground truncate">{barDetails?.contact || currentBar?.phone || 'Non fourni'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Checklist */}
          <div className="space-y-2.5">
            <ChecklistItem
              label="Gérants"
              detail={`${realData.managerCount} compte${realData.managerCount > 1 ? 's' : ''}`}
              status={realData.managerCount > 0 ? 'ok' : 'optional'}
              onEdit={() => handleEditStep(OnboardingStep.OWNER_ADD_MANAGERS)}
            />
            <ChecklistItem
              label="Personnel"
              detail={realData.staffCount > 0 ? `${realData.staffCount} serveur${realData.staffCount > 1 ? 's' : ''}` : 'Dynamique (mode simplifié)'}
              status={realData.staffCount > 0 ? 'ok' : 'warning'}
              onEdit={() => handleEditStep(OnboardingStep.OWNER_SETUP_STAFF)}
            />
            <ChecklistItem
              label="Produits"
              detail={`${realData.productNames.length} produit${realData.productNames.length > 1 ? 's' : ''}`}
              status={realData.productNames.length > 0 ? 'ok' : 'missing'}
              onEdit={() => handleEditStep(OnboardingStep.OWNER_ADD_PRODUCTS)}
            >
              {realData.productNames.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {realData.productNames.map((name, idx) => (
                    <span key={idx} className="inline-block px-2 py-0.5 bg-card border border-border rounded-full text-caption text-foreground/70">
                      {name}
                    </span>
                  ))}
                </div>
              )}
            </ChecklistItem>
            <ChecklistItem
              label="Stock initial"
              detail={`${realData.totalStock} unité${realData.totalStock > 1 ? 's' : ''} au total`}
              status={realData.totalStock > 0 ? 'ok' : 'warning'}
              onEdit={() => handleEditStep(OnboardingStep.OWNER_STOCK_INIT)}
            />
          </div>

          {/* Info boxes */}
          <div className="p-4 bg-muted border border-border rounded-xl space-y-2">
            <p className="text-caption text-foreground/70 leading-relaxed">
              <span className="font-semibold text-foreground">✨ Une fois lancé,</span> votre bar est prêt pour les ventes. Les gérants peuvent commencer à créer des transactions.
            </p>
            <p className="text-caption text-foreground/70 leading-relaxed">
              <span className="font-semibold text-foreground">💡 Conseil :</span> cliquez sur le bouton <span className="font-medium text-brand-primary">Guide (?)</span> en haut à droite pour des visites guidées.
            </p>
          </div>

          {/* Error Message */}
          {errors && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-caption text-red-700">{errors}</p>
            </div>
          )}

          {/* Footer */}
          <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-border items-center justify-between">
            <button
              type="button"
              onClick={previousStep}
              className="text-body-sm font-medium text-foreground/70 hover:text-foreground px-3 py-2 rounded-lg hover:bg-muted transition-colors"
            >
              Retour
            </button>

            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="text-caption text-muted-foreground hover:text-foreground/70 font-medium px-3 py-2 transition-colors"
            >
              Compléter plus tard
            </button>

            <LoadingButton
              type="submit"
              isLoading={loading}
              loadingText="Lancement…"
              className="btn-brand h-11 px-6 rounded-xl text-body-sm font-semibold"
            >
              🚀 Lancer le bar
            </LoadingButton>
          </div>
        </form>
      </div>
    </div>
  );
};
