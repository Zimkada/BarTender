// Language: French (Français)
import React, { useState } from 'react';
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

    // Validate: At least 1 product required if submitting
    if (formData.products.length === 0) {
      setErrors('❌ Veuillez ajouter au moins 1 produit pour continuer, ou cliquez sur "Compléter Plus Tard".');
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

      // Add products to bar via API (products already have prices from modal)
      await OnboardingService.addProductsToBar(barId, formData.products, userId);

      // Save form data to context
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
                    <span className="text-sm text-gray-900 block">ID : {product.productId}</span>
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

          {/* Buttons */}
          <div className="flex gap-3 pt-6 border-t">
            <button
              type="button"
              onClick={previousStep}
              className="px-6 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              Retour
            </button>
            <button
              type="button"
              onClick={() => {
                // Allow skip without adding products
                updateStepData(OnboardingStep.OWNER_ADD_PRODUCTS, formData);
                completeStep(OnboardingStep.OWNER_ADD_PRODUCTS, formData);
                nextStep();
              }}
              className="px-6 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              Compléter Plus Tard
            </button>
            <LoadingButton
              type="submit"
              isLoading={loading}
              loadingText="Enregistrement..."
              className="ml-auto px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
              disabled={formData.products.length === 0}
            >
              Étape Suivante
            </LoadingButton>
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
