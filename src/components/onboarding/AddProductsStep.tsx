// Language: French (Français)
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOnboarding, OnboardingStep } from '../../context/OnboardingContext';
import { useAuth } from '../../context/AuthContext';
import { useBar } from '../../context/BarContext';
import { LoadingButton } from '../ui/LoadingButton';
import { OnboardingService } from '../../services/supabase/onboarding.service';
import { ProductSelectorModal } from './modals/ProductSelectorModal';

interface ProductWithPrice {
  productId: string;
  localPrice: number;
}

interface AddProductsFormData {
  products: ProductWithPrice[];
}

type SelectedProduct = ProductWithPrice;

export const AddProductsStep: React.FC = () => {
  const navigate = useNavigate();
  const { currentSession } = useAuth();
  const { currentBar } = useBar();
  const { stepData, updateStepData, completeStep, nextStep, previousStep } = useOnboarding();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string>('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Initialize form with saved data
  const savedData = stepData[OnboardingStep.OWNER_ADD_PRODUCTS] as AddProductsFormData | undefined;
  const [formData, setFormData] = useState<AddProductsFormData>({
    products: savedData?.products || [],
  });

  // Map productId -> productName for display
  const [productNames, setProductNames] = useState<Record<string, string>>({});

  // Load product names from database when formData.products changes
  React.useEffect(() => {
    const loadProductNames = async () => {
      if (formData.products.length === 0) return;
      if (!currentBar?.id) return;

      const productIds = formData.products.map((p) => p.productId);

      // Import supabase at top if not already imported
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
  }, [formData.products, currentBar?.id]);

  const handleOpenProductSelector = () => {
    setIsModalOpen(true);
  };

  const handleModalConfirm = (products: SelectedProduct[]) => {
    // Merge with existing products (avoid duplicates)
    const existingIds = new Set(formData.products.map((p) => p.productId));
    const newProducts = products.filter((p) => !existingIds.has(p.productId));
    setFormData({
      products: [...formData.products, ...newProducts],
    });
    setIsModalOpen(false);
  };

  const handleRemoveProduct = (productId: string) => {
    setFormData((prev) => ({
      products: prev.products.filter((p) => p.productId !== productId),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors('');

    setLoading(true);
    try {
      // Save form data to context (no need to persist if already in DB)
      updateStepData(OnboardingStep.OWNER_ADD_PRODUCTS, formData);
      completeStep(OnboardingStep.OWNER_ADD_PRODUCTS, formData);

      // Move to next step
      nextStep();
    } catch (error: any) {
      console.error('Erreur lors de l\'enregistrement des produits:', error);
      setErrors(error.message || 'Impossible d\'enregistrer les produits');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-4">
      <div className="bg-white rounded-lg shadow-md p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Ajouter des Produits au Catalogue</h1>
          <p className="mt-2 text-gray-600">
            Sélectionnez les produits du catalogue global et fixez les prix locaux. (optionnel)
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Product Count */}
          <div className={`p-4 border rounded-lg ${formData.products.length === 0
            ? 'bg-amber-50 border-amber-200'
            : 'bg-green-50 border-green-200'
            }`}>
            <p className={`text-sm font-medium ${formData.products.length === 0
              ? 'text-amber-900'
              : 'text-green-900'
              }`}>
              Produits ajoutés : <strong>{formData.products.length}</strong>
            </p>
            {formData.products.length === 0 && (
              <p className="mt-1 text-sm text-amber-700">
                💡 Vous pouvez ajouter des produits maintenant ou plus tard
              </p>
            )}
          </div>

          {/* Product List */}
          {formData.products.length > 0 && (
            <div className="space-y-2">
              {formData.products.map((product) => (
                <div
                  key={product.productId}
                  className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg"
                >
                  <div>
                    <span className="text-sm text-gray-900 block font-medium">
                      {productNames[product.productId] || product.productId}
                    </span>
                    <span className="text-xs text-gray-600">Prix : {product.localPrice.toFixed(2)} FCFA</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveProduct(product.productId)}
                    className="text-red-600 hover:text-red-700 text-sm font-medium"
                  >
                    Supprimer
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add Products Button */}
          <button
            type="button"
            onClick={handleOpenProductSelector}
            className="w-full px-4 py-3 border border-dashed border-blue-300 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition font-medium"
          >
            + Parcourir et Ajouter des Produits
          </button>

          {/* Info Box */}
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <h3 className="text-sm font-medium text-gray-900 mb-2">Ce qui se passe ensuite :</h3>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>✓ Pour chaque produit, vous fixerez le prix local</li>
              <li>✓ Ensuite, initialisez le stock (combien d'unités vous avez)</li>
              <li>✓ Recommandation minimale : 5+ produits</li>
            </ul>
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
                    // Persist to BD if there are products to save
                    if (formData.products.length > 0 && currentBar?.id && currentSession?.userId) {
                      await OnboardingService.addProductsToBar(currentBar.id, formData.products, currentSession.userId);
                    }

                    // Save form data to context
                    updateStepData(OnboardingStep.OWNER_ADD_PRODUCTS, formData);
                    completeStep(OnboardingStep.OWNER_ADD_PRODUCTS, formData);

                    // ⚠️ IMPORTANT: Do NOT call completeOnboarding() here
                    // User wants to "Complete Later", not mark entire onboarding as done
                    // They should continue to Stock Init step or manually exit
                    // The banner will reappear when they come back if bar is not fully setup

                    // Redirect to dashboard
                    navigate('/dashboard');
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

      {/* Product Selector Modal */}
      <ProductSelectorModal
        isOpen={isModalOpen}
        onConfirm={handleModalConfirm}
        onCancel={() => setIsModalOpen(false)}
        selectedProducts={formData.products}
      />
    </div>
  );
};
