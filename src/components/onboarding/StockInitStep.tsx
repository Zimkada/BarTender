// Language: French (Français)
import React, { useState } from 'react';
import { useOnboarding, OnboardingStep } from '../../context/OnboardingContext';
import { useAuth } from '../../context/AuthContext';
import { useBar } from '../../context/BarContext';
import { LoadingButton } from '../ui/LoadingButton';
import { OnboardingService } from '../../services/supabase/onboarding.service';

interface StockInitFormData {
  stocks: Record<string, number>;
}

export const StockInitStep: React.FC = () => {
  const { currentSession } = useAuth();
  const { currentBar } = useBar();
  const { stepData, updateStepData, completeStep, nextStep, previousStep, completeOnboarding } = useOnboarding();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string>('');

  // Get products from previous step
  const productsData = stepData[OnboardingStep.OWNER_ADD_PRODUCTS] as any;
  const productIds = productsData?.products?.map((p: any) => p.productId) || [];

  // Initialize form with saved data or defaults
  const savedData = stepData[OnboardingStep.OWNER_STOCK_INIT] as StockInitFormData | undefined;
  const [formData, setFormData] = useState<StockInitFormData>({
    stocks: savedData?.stocks || productIds.reduce((acc: Record<string, number>, id: string) => ({ ...acc, [id]: 0 }), {}),
  });

  // Map productId -> productName for display
  const [productNames, setProductNames] = useState<Record<string, string>>({});

  // Load product names from database
  React.useEffect(() => {
    const loadProductNames = async () => {
      if (productIds.length === 0) return;
      if (!currentBar?.id) return;

      // Import supabase
      const { supabase } = await import('@/lib/supabase');

      // Fetch from bar_products to get display_name (works for both local and global products)
      const { data: products } = await supabase
        .from('bar_products')
        .select('id, display_name')
        .eq('bar_id', currentBar.id)
        .in('id', productIds);

      if (products) {
        const nameMap: Record<string, string> = {};
        products.forEach((p: any) => {
          nameMap[p.id] = p.display_name;
        });
        setProductNames(nameMap);
      }
    };

    loadProductNames();
  }, [productIds.length, currentBar?.id]);

  const handleStockChange = (productId: string, value: string) => {
    const quantity = Math.max(0, parseInt(value, 10) || 0);
    setFormData((prev) => ({
      stocks: {
        ...prev.stocks,
        [productId]: quantity,
      },
    }));
    setErrors('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors('');

    // Validate: all products have stock entry (can be 0)
    const hasAllStocks = productIds.every((id: string) => formData.stocks[id] !== undefined);
    if (!hasAllStocks) {
      setErrors('Tous les produits doivent avoir une valeur de stock');
      return;
    }

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

      // Initialize stock via API
      await OnboardingService.initializeStock(barId, formData.stocks, userId);

      // Save form data to context
      updateStepData(OnboardingStep.OWNER_STOCK_INIT, formData);
      completeStep(OnboardingStep.OWNER_STOCK_INIT, formData);

      // Move to next step
      nextStep();
    } catch (error: any) {
      console.error('Erreur lors de l\'enregistrement du stock:', error);
      setErrors(error.message || 'Impossible d\'enregistrer le stock');
    } finally {
      setLoading(false);
    }
  };

  const totalValue = Object.values(formData.stocks).reduce((sum, qty) => sum + qty, 0);

  return (
    <div className="w-full max-w-2xl mx-auto px-4">
      <div className="bg-white rounded-lg shadow-md p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Stock Initial</h1>
          <p className="mt-2 text-gray-600">
            Définissez l'inventaire initial pour chaque produit. (optionnel)
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Info Box */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="text-sm font-medium text-blue-900 mb-2">À propos du stock initial :</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>💡 Définir le stock pour chaque produit que vous avez ajouté</li>
              <li>💡 Le stock peut être 0 si vous n'avez pas encore d'inventaire</li>
              <li>💡 Vous pouvez ajuster plus tard quand vous réapprovisionnerez</li>
              <li>📊 Total d'unités : <strong>{totalValue}</strong></li>
            </ul>
          </div>

          {/* Stock Inputs */}
          <div className="space-y-4">
            {productIds.length > 0 ? (
              productIds.map((productId: string) => (
                <div key={productId} className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                  <div className="flex items-end gap-4">
                    <div className="flex-1">
                      <label
                        htmlFor={`stock-${productId}`}
                        className="block text-sm font-medium text-gray-700 mb-1"
                      >
                        Produit : {productNames[productId] || productId}
                      </label>
                      <input
                        id={`stock-${productId}`}
                        type="number"
                        min="0"
                        value={formData.stocks[productId] || 0}
                        onChange={(e) => handleStockChange(productId, e.target.value)}
                        placeholder="0"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-200 focus:outline-none"
                      />
                    </div>
                    <div className="text-sm text-gray-600 pb-2">
                      <span className="font-medium">{formData.stocks[productId] || 0}</span> unités
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-600">Aucun produit ajouté pour le moment. Retournez et ajoutez d'abord des produits.</p>
            )}
          </div>

          {/* Example */}
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <h3 className="text-sm font-medium text-gray-900 mb-2">Exemple :</h3>
            <div className="text-sm text-gray-700 space-y-1">
              <p>Heineken : 24 unités (votre envoi initial)</p>
              <p>Snacks : 15 unités (boîte ouverte)</p>
              <p>Vodka : 2 bouteilles (1 ouverte, 1 pleine)</p>
            </div>
          </div>

          {/* Error Message */}
          {errors && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700">{errors}</p>
            </div>
          )}

          {/* Buttons - Responsive Layout */}
          <div className="pt-6 border-t space-y-3">
            {/* Mobile: Retour + Étape Suivante sur la même ligne */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={previousStep}
                className="flex-1 sm:flex-none px-4 sm:px-6 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                Retour
              </button>
              <LoadingButton
                type="submit"
                isLoading={loading}
                loadingText="Enregistrement..."
                className="flex-1 sm:flex-none sm:ml-auto px-4 sm:px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                Étape Suivante
              </LoadingButton>
            </div>

            {/* Compléter Plus Tard centré en dessous */}
            <div className="flex justify-center">
              <LoadingButton
                type="button"
                isLoading={loading}
                loadingText="Sauvegarde..."
                onClick={async () => {
                  setLoading(true);
                  try {
                    if (Object.keys(formData.stocks).length > 0 && currentBar?.id && currentSession?.userId) {
                      await OnboardingService.initializeStock(currentBar.id, formData.stocks, currentSession.userId);
                    }
                    updateStepData(OnboardingStep.OWNER_STOCK_INIT, formData);
                    completeStep(OnboardingStep.OWNER_STOCK_INIT, formData);
                    completeOnboarding();
                  } catch (error: any) {
                    setErrors('Erreur lors de la sauvegarde : ' + error.message);
                  } finally {
                    setLoading(false);
                  }
                }}
                className="w-full sm:w-auto px-4 sm:px-6 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                Compléter Plus Tard
              </LoadingButton>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
