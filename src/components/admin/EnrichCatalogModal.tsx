/**
 * components/admin/EnrichCatalogModal.tsx
 * Modal pour enrichir le catalogue global avec un produit local
 *
 * Workflow :
 * 1. Affiche le produit source
 * 2. Détecte les doublons potentiels
 * 3. Formulaire éditable pour le produit global
 * 4. Confirmation et création
 */

import { useState, useEffect } from 'react';
import { AlertCircle, Image as ImageIcon, Loader2 } from 'lucide-react';
import { CatalogEnrichmentService } from '../../services/supabase/catalogEnrichment.service';
import { ProductNormalization } from '../../utils/productNormalization';
import type {
  LocalProductForEnrichment,
  EnrichGlobalCatalogData,
  SimilarGlobalProduct,
  EnrichmentStatus
} from '../../types/catalogEnrichment';
import { useNotifications } from '../Notifications';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Alert } from '../ui/Alert';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Textarea } from '../ui/Textarea';
import { Checkbox } from '../ui/Checkbox';
import { LoadingButton } from '../ui/LoadingButton';

interface EnrichCatalogModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceProduct: LocalProductForEnrichment;
  onSuccess?: () => void;
}

const GLOBAL_CATEGORIES = [
  'Alcools',
  'Bière',
  'Spiritueux',
  'Vin',
  'Cocktails',
  'Softs',
  'Jus',
  'Eau',
  'Café',
  'Thé',
  'Petit-déjeuner',
  'Snacks',
  'Autres'
];

const STANDARD_VOLUMES = ['25cl', '33cl', '50cl', '60cl', '70cl', '1L', '1.5L', 'Autre'];

export function EnrichCatalogModal({
  isOpen,
  onClose,
  sourceProduct,
  onSuccess
}: EnrichCatalogModalProps) {
  const { showNotification } = useNotifications();

  // État
  const [status, setStatus] = useState<EnrichmentStatus>('idle');
  const [similarProducts, setSimilarProducts] = useState<SimilarGlobalProduct[]>([]);
  const [foundDuplicate, setFoundDuplicate] = useState(false);

  // Formulaire
  const [name, setName] = useState(sourceProduct.localName);
  const [category, setCategory] = useState('Autres');
  const [volume, setVolume] = useState(sourceProduct.volume || '33cl');
  const [brand, setBrand] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [image, setImage] = useState(sourceProduct.localImage || '');
  const [subcategory, setSubcategory] = useState('');
  const [barcode, setBarcode] = useState('');
  const [description, setDescription] = useState('');
  const [priceMin, setPriceMin] = useState(
    ProductNormalization.calculateSuggestedPriceRange(sourceProduct.price).min
  );
  const [priceMax, setPriceMax] = useState(
    ProductNormalization.calculateSuggestedPriceRange(sourceProduct.price).max
  );
  const [linkSourceProduct, setLinkSourceProduct] = useState(true);

  // Détection doublons au chargement
  useEffect(() => {
    if (isOpen && name && sourceProduct) {
      detectSimilarProducts();
    }
  }, [isOpen]);

  // Re-détecter doublons quand le nom change
  useEffect(() => {
    const timer = setTimeout(() => {
      if (name && isOpen) {
        detectSimilarProducts();
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [name, isOpen]);

  async function detectSimilarProducts() {
    try {
      setStatus('checking');
      const similar = await CatalogEnrichmentService.findSimilarGlobalProducts(
        name,
        volume
      );

      setSimilarProducts(similar);
      setFoundDuplicate(similar.length > 0);

      if (similar.length > 0) {
        showNotification({
          type: 'warning',
          message: `⚠️ ${similar.length} produit(s) similaire(s) détecté(s). Vérifiez-les avant de continuer.`
        });
      }
    } catch (error) {
      console.error('Erreur détection doublons:', error);
    } finally {
      setStatus('idle');
    }
  }

  async function handleEnrich() {
    // Validations
    if (!name.trim()) {
      showNotification({ type: 'error', message: 'Le nom est requis' });
      return;
    }

    if (!image && !sourceProduct.localImage) {
      showNotification({
        type: 'error',
        message: 'Une image est requise pour enrichir le catalogue'
      });
      return;
    }

    const enrichmentData: EnrichGlobalCatalogData = {
      name: name.trim(),
      category,
      volume: ProductNormalization.normalizeVolume(volume),
      brand: brand.trim() || undefined,
      manufacturer: manufacturer.trim() || undefined,
      official_image: image || undefined,
      subcategory: subcategory.trim() || undefined,
      barcode: barcode.trim() || undefined,
      description: description.trim() || undefined,
      suggested_price_min: priceMin,
      suggested_price_max: priceMax,
      linkSourceProduct
    };

    try {
      setStatus('processing');

      await CatalogEnrichmentService.enrichGlobalCatalogWithLocal(
        sourceProduct.barProductId,
        enrichmentData
      );

      showNotification({
        type: 'success',
        message: `✅ "${name}" a été enrichi au catalogue global !`
      });

      onSuccess?.();
      onClose();
    } catch (error: any) {
      showNotification({
        type: 'error',
        message: error.message || 'Erreur lors de l\'enrichissement'
      });
    } finally {
      setStatus('idle');
    }
  }

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="➕ Enrichir le Catalogue Global"
      size="lg"
    >
      <div className="space-y-6 max-h-[80vh] overflow-y-auto">
        {/* Produit source */}
        <div>
          <h3 className="font-semibold mb-3">📦 Produit Source</h3>
          <Card className="p-4 bg-blue-50 border-blue-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Nom local:</span>
                <p className="font-medium">{sourceProduct.localName}</p>
              </div>
              <div>
                <span className="text-gray-600">Bar:</span>
                <p className="font-medium">{sourceProduct.barName}</p>
              </div>
              <div>
                <span className="text-gray-600">Prix:</span>
                <p className="font-medium">{sourceProduct.price} FCFA</p>
              </div>
              <div>
                <span className="text-gray-600">Volume:</span>
                <p className="font-medium">{sourceProduct.volume || 'N/A'}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Détection doublons */}
        {foundDuplicate && similarProducts.length > 0 && (
          <Alert variant="warning">
            <AlertCircle className="h-4 w-4" />
            <div className="ml-3">
              <p className="font-semibold text-sm mb-2">Produits similaires détectés :</p>
              <div className="space-y-2">
                {similarProducts.map(product => (
                  <div key={product.id} className="text-xs bg-white p-2 rounded">
                    <p className="font-medium">{product.name}</p>
                    <div className="flex justify-between text-gray-600 mt-1">
                      <span>{product.volume}</span>
                      <span>{product.category}</span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs mt-2 text-orange-700">
                ⚠️ Vérifiez si ce produit existe déjà avant de continuer.
              </p>
            </div>
          </Alert>
        )}

        {/* Formulaire d'enrichissement */}
        <div>
          <h3 className="font-semibold mb-3">🌍 Informations Produit Global</h3>

          <div className="space-y-4">
            {/* Nom */}
            <div>
              <Label>Nom du produit *</Label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="ex: Vodka Artisanale Premium"
              />
            </div>

            {/* Catégorie & Volume */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Catégorie globale *</Label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                >
                  {GLOBAL_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label>Volume standardisé *</Label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={volume}
                  onChange={e => setVolume(e.target.value)}
                >
                  {STANDARD_VOLUMES.map(vol => (
                    <option key={vol} value={vol}>
                      {vol}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Marque & Fabricant */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Marque</Label>
                <Input
                  value={brand}
                  onChange={e => setBrand(e.target.value)}
                  placeholder="ex: Absolut"
                />
              </div>

              <div>
                <Label>Fabricant</Label>
                <Input
                  value={manufacturer}
                  onChange={e => setManufacturer(e.target.value)}
                  placeholder="ex: Pernod Ricard"
                />
              </div>
            </div>

            {/* Image */}
            <div>
              <Label>Image officielle</Label>
              {image || sourceProduct.localImage ? (
                <div className="flex items-center gap-3">
                  <img
                    src={image || sourceProduct.localImage}
                    alt="Aperçu"
                    className="h-16 w-16 object-cover rounded"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setImage('')}
                  >
                    Changer l'image
                  </Button>
                </div>
              ) : (
                <div className="border-2 border-dashed border-gray-300 rounded-md p-4 text-center">
                  <ImageIcon className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                  <p className="text-sm text-gray-600">Utiliser l'image du produit source</p>
                </div>
              )}
            </div>

            {/* Prix suggéré */}
            <div>
              <Label>Fourchette de prix suggéré</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  type="number"
                  value={priceMin}
                  onChange={e => setPriceMin(parseInt(e.target.value) || 0)}
                  label="Min (FCFA)"
                  placeholder="ex: 4000"
                />
                <Input
                  type="number"
                  value={priceMax}
                  onChange={e => setPriceMax(parseInt(e.target.value) || 0)}
                  label="Max (FCFA)"
                  placeholder="ex: 6000"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Calculé automatiquement : {priceMin} - {priceMax} FCFA (±20% du prix local)
              </p>
            </div>

            {/* Autres champs optionnels */}
            <details className="border rounded-md p-3">
              <summary className="cursor-pointer font-medium text-sm">
                Informations supplémentaires (optionnel)
              </summary>

              <div className="space-y-3 mt-3">
                <div>
                  <Label>Sous-catégorie</Label>
                  <Input
                    value={subcategory}
                    onChange={e => setSubcategory(e.target.value)}
                    placeholder="ex: Vodka Premium"
                  />
                </div>

                <div>
                  <Label>Code-barres</Label>
                  <Input
                    value={barcode}
                    onChange={e => setBarcode(e.target.value)}
                    placeholder="ex: 5901234123457"
                  />
                </div>

                <div>
                  <Label>Description</Label>
                  <Textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Détails supplémentaires sur le produit..."
                    rows={3}
                  />
                </div>
              </div>
            </details>

            {/* Option liaison */}
            <div className="flex items-center gap-2 p-3 bg-green-50 rounded border border-green-200">
              <Checkbox
                checked={linkSourceProduct}
                onChange={e => setLinkSourceProduct(e.target.checked)}
              />
              <label className="text-sm cursor-pointer">
                <span className="font-medium">🔗 Lier automatiquement</span>
                <p className="text-xs text-gray-600 mt-0.5">
                  Le produit du bar source sera lié au nouveau produit global
                </p>
              </label>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>

          <LoadingButton
            onClick={handleEnrich}
            loading={status === 'processing' || status === 'checking'}
            disabled={status === 'checking' || !name.trim()}
            variant="primary"
          >
            {status === 'processing' ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Enrichissement en cours...
              </>
            ) : (
              <>✅ Enrichir le catalogue</>
            )}
          </LoadingButton>
        </div>
      </div>
    </Modal>
  );
}
