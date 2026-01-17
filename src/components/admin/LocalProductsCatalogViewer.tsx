/**
 * components/admin/LocalProductsCatalogViewer.tsx
 * Vue Admin : Consulter les produits locaux (custom) de tous les bars
 * et les enrichir au catalogue global
 */

import { useState, useEffect } from 'react';
import { Search, Package, Download, AlertCircle } from 'lucide-react';
import { CatalogEnrichmentService } from '../../services/supabase/catalogEnrichment.service';
import type { LocalProductForEnrichment } from '../../types/catalogEnrichment';
import { useNotifications } from '../Notifications';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { Alert } from '../ui/Alert';
import { LoadingButton } from '../ui/LoadingButton';
import { EnrichCatalogModal } from './EnrichCatalogModal';

interface LocalProductsCatalogViewerProps {
  onEnrichmentSuccess?: () => void;
}

export function LocalProductsCatalogViewer({
  onEnrichmentSuccess
}: LocalProductsCatalogViewerProps) {
  const { showNotification } = useNotifications();
  const [products, setProducts] = useState<LocalProductForEnrichment[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<LocalProductForEnrichment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBar, setFilterBar] = useState<string>('all');
  const [selectedProduct, setSelectedProduct] = useState<LocalProductForEnrichment | null>(null);
  const [isEnrichModalOpen, setIsEnrichModalOpen] = useState(false);

  // Récupérer tous les produits custom
  useEffect(() => {
    loadLocalProducts();
  }, []);

  // Filtrer les produits
  useEffect(() => {
    let filtered = products;

    if (searchTerm) {
      filtered = filtered.filter(p =>
        p.localName.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (filterBar !== 'all') {
      filtered = filtered.filter(p => p.barId === filterBar);
    }

    setFilteredProducts(filtered);
  }, [searchTerm, filterBar, products]);

  async function loadLocalProducts() {
    try {
      setLoading(true);
      const allProducts = await CatalogEnrichmentService.getAllCustomLocalProducts({
        limit: 100
      });
      setProducts(allProducts);
    } catch (error: any) {
      showNotification({
        type: 'error',
        message: error.message || 'Erreur lors du chargement des produits locaux'
      });
    } finally {
      setLoading(false);
    }
  }

  function handleEnrichClick(product: LocalProductForEnrichment) {
    console.log('🔵 handleEnrichClick called. Product:', product.localName);
    setSelectedProduct(product);
    setIsEnrichModalOpen(true);
    console.log('📍 Modal should open now');
  }

  function handleEnrichmentSuccess() {
    setIsEnrichModalOpen(false);
    setSelectedProduct(null);
    showNotification({
      type: 'success',
      message: 'Produit enrichi au catalogue global avec succès ! 🎉'
    });
    loadLocalProducts(); // Recharger la liste
    onEnrichmentSuccess?.();
  }

  // Extraire liste unique des bars
  const uniqueBars = Array.from(
    new Map(products.map(p => [p.barId, { barId: p.barId, barName: p.barName }])).values()
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">📦 Produits Locaux</h2>
        <div className="text-sm text-gray-600">
          {filteredProducts.length} produit{filteredProducts.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Info */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <div className="ml-3">
          <p className="text-sm">
            Consultez tous les produits custom des bars et enrichissez le catalogue global en les
            promouvant. Seuls les Super Admins peuvent effectuer cette action.
          </p>
        </div>
      </Alert>

      {/* Filtres */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Recherche */}
        <div className="md:col-span-2">
          <Input
            placeholder="Rechercher un produit..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            prefix={<Search className="h-4 w-4" />}
          />
        </div>

        {/* Filtre bar */}
        <select
          className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={filterBar}
          onChange={e => setFilterBar(e.target.value)}
        >
          <option value="all">Tous les bars</option>
          {uniqueBars.map(bar => (
            <option key={bar.barId} value={bar.barId}>
              {bar.barName}
            </option>
          ))}
        </select>
      </div>

      {/* Liste des produits */}
      {filteredProducts.length === 0 ? (
        <Card className="p-8 text-center">
          <Package className="h-12 w-12 mx-auto mb-3 text-gray-400" />
          <p className="text-gray-600">Aucun produit local trouvé</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map(product => (
            <Card key={product.barProductId} className="overflow-hidden hover:shadow-lg transition">
              {/* Image */}
              <div className="aspect-square bg-gray-200 overflow-hidden">
                {product.localImage ? (
                  <img
                    src={product.localImage}
                    alt={product.localName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="h-12 w-12 text-gray-400" />
                  </div>
                )}
              </div>

              {/* Contenu */}
              <div className="p-4 space-y-3">
                {/* Nom */}
                <div>
                  <h3 className="font-semibold text-gray-900 line-clamp-2">
                    {product.localName}
                  </h3>
                  <Badge variant="outline" className="mt-1">
                    {product.barName}
                  </Badge>
                </div>

                {/* Détails */}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-600">Volume:</span>
                    <p className="font-medium">{product.volume || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Prix:</span>
                    <p className="font-medium">{product.price} FCFA</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Catégorie:</span>
                    <p className="font-medium text-xs">{product.localCategoryName}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Stock:</span>
                    <p className="font-medium">{product.stock}</p>
                  </div>
                </div>

                {/* Bouton action */}
                <Button
                  onClick={() => handleEnrichClick(product)}
                  className="w-full"
                  variant="primary"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Enrichir le catalogue
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal d'enrichissement */}
      {selectedProduct && (
        <EnrichCatalogModal
          isOpen={isEnrichModalOpen}
          onClose={() => setIsEnrichModalOpen(false)}
          sourceProduct={selectedProduct}
          onSuccess={handleEnrichmentSuccess}
        />
      )}
    </div>
  );
}
