import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Package, AlertTriangle, Plus, Edit, Trash2, UploadCloud, TruckIcon, BarChart3 } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useStockManagement } from '../hooks/useStockManagement';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { ProductModal } from './ProductModal';
import { SupplyModal } from './SupplyModal';
import { Product } from '../types';
import { motion } from 'framer-motion';
import { useFeedback } from '../hooks/useFeedback';
import { useViewport } from '../hooks/useViewport';
import { ProductImport } from './ProductImport';
import { searchProducts } from '../utils/productFilters';
import { sortProducts, SortMode } from '../utils/productSorting';
import { SearchBar } from './common/SearchBar';
import { CollapsibleSection } from './common/CollapsibleSection';
import { CategoryStatsList } from './common/CategoryStatsList';
import { ConfirmationModal } from './common/ConfirmationModal';
import { EmptyState } from './common/EmptyState';

/**
 * Inventory - Page de gestion des produits
 * Route: /inventory
 * Refactoré de modale vers page
 */
export default function Inventory() {
  const navigate = useNavigate();
  const { categories, getAverageCostPerUnit, addExpense } = useAppContext();
  const {
    products,
    addProduct,
    updateProduct,
    deleteProduct,
    getProductStockInfo,
    processSupply,
  } = useStockManagement();

  const { formatPrice } = useCurrencyFormatter();
  const { isMobile } = useViewport();
  const [showProductModal, setShowProductModal] = useState(false);
  const [showSupplyModal, setShowSupplyModal] = useState(false);
  const [showProductImport, setShowProductImport] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | undefined>();
  const { showSuccess } = useFeedback();

  // États pour confirmation suppression
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // États pour recherche et tri
  const [searchTerm, setSearchTerm] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('category');

  const lowStockProducts = useMemo(() =>
    products.filter(p => {
      const stockInfo = getProductStockInfo(p.id);
      return stockInfo && stockInfo.physicalStock <= p.alertThreshold;
    }),
    [products, getProductStockInfo]);

  const filteredProducts = useMemo(
    () => !searchTerm.trim() ? products : searchProducts(products, searchTerm),
    [products, searchTerm]
  );

  const sortedProducts = useMemo(
    () => sortProducts(filteredProducts, sortMode, categories),
    [filteredProducts, sortMode, categories]
  );

  const categoryStats = useMemo(() => {
    return categories.map(cat => {
      const catProducts = products.filter(p => p.categoryId === cat.id);
      const catAlerts = catProducts.filter(p => {
        const stockInfo = getProductStockInfo(p.id);
        return stockInfo && stockInfo.physicalStock <= p.alertThreshold;
      });
      return {
        categoryId: cat.id,
        categoryName: cat.name,
        categoryColor: cat.color,
        totalProducts: catProducts.length,
        alertsCount: catAlerts.length
      };
    }).filter(stat => stat.totalProducts > 0);
  }, [products, categories, getProductStockInfo]);

  const alertsDefaultOpen = lowStockProducts.length > 0 && lowStockProducts.length < 4;

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product);
    setShowProductModal(true);
  };

  const handleDeleteClick = (product: Product) => {
    setProductToDelete(product);
  };

  const handleDeleteConfirm = async () => {
    if (!productToDelete) return;
    setIsDeleting(true);
    try {
      await deleteProduct(productToDelete.id);
      showSuccess('Produit supprimé');
      setProductToDelete(null);
    } catch (error) {
      console.error('Erreur suppression:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAddProduct = () => {
    setEditingProduct(undefined);
    setShowProductModal(true);
  };

  const handleSupply = async (supplyData: {
    productId: string;
    quantity: number;
    lotSize: number;
    lotPrice: number;
    supplier: string;
  }) => {
    try {
      await processSupply(supplyData, (expenseData) => {
        addExpense(expenseData);
      });
      showSuccess('Approvisionnement effectué avec succès');
      setShowSupplyModal(false);
    } catch (error) {
      console.error('Erreur approvisionnement:', error);
    }
  };

  const getCategoryName = (categoryId: string) => {
    return categories.find(cat => cat.id === categoryId)?.name || 'Sans catégorie';
  };

  const getMargin = (product: Product) => {
    const avgCost = getAverageCostPerUnit(product.id);
    if (avgCost === 0) return 0;
    return ((product.price - avgCost) / product.price) * 100;
  };

  // ========== VERSION MOBILE ==========
  if (isMobile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-amber-50">
        {/* Header fixe */}
        <div className="sticky top-0 bg-gradient-to-r from-amber-500 to-amber-500 text-white shadow-lg z-10">
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => navigate(-1)} 
                  className="p-2 hover:bg-white/20 rounded-lg"
                >
                  <ArrowLeft size={20} />
                </button>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Package size={20} />
                  Inventaire
                </h2>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setShowProductImport(true)}
                className="flex-1 min-w-[120px] px-3 py-2 bg-white/20 backdrop-blur rounded-lg text-sm font-medium flex items-center justify-center gap-2 active:bg-white/30"
              >
                <UploadCloud size={16} />
                Importer
              </button>
              <button
                onClick={() => setShowSupplyModal(true)}
                className="flex-1 min-w-[120px] px-3 py-2 bg-white/20 backdrop-blur rounded-lg text-sm font-medium flex items-center justify-center gap-2 active:bg-white/30"
              >
                <TruckIcon size={16} />
                Approvisionner
              </button>
              <button
                onClick={handleAddProduct}
                className="flex-1 min-w-[120px] px-3 py-2 bg-white text-amber-600 rounded-lg text-sm font-medium flex items-center justify-center gap-2 active:bg-amber-50"
              >
                <Plus size={16} />
                Ajouter
              </button>
            </div>
          </div>

          {/* Recherche et tri */}
          <div className="px-4 pb-3 space-y-2">
            <SearchBar
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="Rechercher..."
            />
            <div className="flex gap-2">
              {[
                { mode: 'category' as SortMode, icon: '📁', label: 'Cat.' },
                { mode: 'alphabetical' as SortMode, icon: '🔤', label: 'A-Z' },
                { mode: 'stock' as SortMode, icon: '⚠️', label: 'Stock' }
              ].map(({ mode, icon, label }) => (
                <button
                  key={mode}
                  onClick={() => setSortMode(mode)}
                  className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    sortMode === mode
                      ? 'bg-amber-500 text-white'
                      : 'bg-white/30 text-white hover:bg-white/40'
                  }`}
                >
                  <span className="mr-1">{icon}</span>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Contenu */}
        <div className="px-4 py-4 pb-20">
          <div className="space-y-3 mb-4">
            <CollapsibleSection
              title="Nombre Produits"
              icon={<BarChart3 size={16} className="text-amber-600" />}
              badge={`${sortedProducts.length}/${products.length}`}
              defaultOpen={false}
            >
              <CategoryStatsList stats={categoryStats} showAlerts={false} />
            </CollapsibleSection>

            {lowStockProducts.length === 0 ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                <p className="text-green-700 text-xs font-medium">✅ Tous les stocks sont OK</p>
              </div>
            ) : (
              <CollapsibleSection
                title="Alertes"
                icon={<AlertTriangle size={16} className="text-orange-600" />}
                badge={lowStockProducts.length}
                defaultOpen={alertsDefaultOpen}
                className="border-orange-200"
              >
                <div className="space-y-1.5">
                  {lowStockProducts.map(product => {
                    const stockInfo = getProductStockInfo(product.id);
                    return (
                      <div key={product.id} className="flex items-center justify-between p-2 bg-orange-50 rounded-lg">
                        <span className="text-xs text-gray-700">
                          {product.name} {product.volume && `(${product.volume})`}
                        </span>
                        <span className="text-xs font-medium text-orange-600">
                          {stockInfo?.physicalStock ?? 'N/A'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CollapsibleSection>
            )}
          </div>

          {/* Liste produits */}
          {sortedProducts.length === 0 ? (
            <EmptyState
              icon={Package}
              message="Aucun produit trouvé"
              subMessage={searchTerm ? "Essayez une autre recherche" : "Aucun produit dans l'inventaire"}
            />
          ) : (
            <div className="space-y-3">
              {sortedProducts.map((product) => {
                const avgCost = getAverageCostPerUnit(product.id);
                const margin = getMargin(product);
                const stockInfo = getProductStockInfo(product.id);

                return (
                  <div key={product.id} className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200 overflow-hidden">
                    <div className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-gray-800 text-base mb-1">{product.name}</h3>
                          <p className="text-gray-600 text-sm">{product.volume}</p>
                          <p className="text-gray-500 text-xs mt-1">{getCategoryName(product.categoryId)}</p>
                        </div>
                        <div className={`flex-shrink-0 px-3 py-1 rounded-full text-sm font-bold ${
                          (stockInfo?.physicalStock ?? 0) <= product.alertThreshold
                            ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}>
                          {stockInfo?.physicalStock ?? 'N/A'}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3 mb-3">
                        <div className="bg-white rounded-lg p-2">
                          <p className="text-xs text-gray-600 mb-1">Prix vente</p>
                          <p className="text-amber-600 font-bold text-sm">{formatPrice(product.price)}</p>
                        </div>
                        <div className="bg-white rounded-lg p-2">
                          <p className="text-xs text-gray-600 mb-1">Coût moy.</p>
                          <p className="text-gray-800 font-bold text-sm">
                            {avgCost > 0 ? formatPrice(avgCost) : '-'}
                          </p>
                        </div>
                        <div className="bg-white rounded-lg p-2">
                          <p className="text-xs text-gray-600 mb-1">Marge</p>
                          <p className={`font-bold text-sm ${
                            margin > 50 ? 'text-green-600' : margin > 30 ? 'text-amber-600' : 'text-red-600'
                          }`}>
                            {margin > 0 ? `${margin.toFixed(1)}%` : '-'}
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditProduct(product)}
                          className="flex-1 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 active:bg-amber-600"
                        >
                          <Edit size={16} />
                          Modifier
                        </button>
                        <button
                          onClick={() => handleDeleteClick(product)}
                          className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium active:bg-red-600"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modales */}
        <ProductImport isOpen={showProductImport} onClose={() => setShowProductImport(false)} />
        <ProductModal
          isOpen={showProductModal}
          onClose={() => setShowProductModal(false)}
          onSave={(productData) => {
            if (editingProduct) {
              updateProduct(editingProduct.id, productData);
            } else {
              addProduct(productData);
            }
            setShowProductModal(false);
          }}
          categories={categories}
          product={editingProduct}
        />
        <SupplyModal
          isOpen={showSupplyModal}
          onClose={() => setShowSupplyModal(false)}
          onSave={handleSupply}
          products={products}
        />
        <ConfirmationModal
          isOpen={!!productToDelete}
          onClose={() => setProductToDelete(null)}
          onConfirm={handleDeleteConfirm}
          title="Supprimer le produit"
          message={`Êtes-vous sûr de vouloir supprimer ${productToDelete?.name} ? Cette action est irréversible.`}
          confirmLabel="Supprimer"
          isDestructive={true}
          isLoading={isDeleting}
        />
      </div>
    );
  }

  // ========== VERSION DESKTOP ==========
  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-amber-100 mb-6 overflow-hidden">
        <div className="bg-gradient-to-r from-amber-500 to-amber-500 text-white p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => navigate(-1)} 
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <ArrowLeft size={24} />
              </button>
              <div className="flex items-center gap-3">
                <Package size={28} />
                <div>
                  <h1 className="text-xl font-bold">Inventaire</h1>
                  <p className="text-sm text-amber-100">Gestion des produits</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowProductImport(true)}
                className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors flex items-center gap-2"
              >
                <UploadCloud size={18} />
                <span className="text-sm font-medium">Importer</span>
              </button>
              <button
                onClick={() => setShowSupplyModal(true)}
                className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors flex items-center gap-2"
              >
                <TruckIcon size={18} />
                <span className="text-sm font-medium">Approvisionnement</span>
              </button>
              <button
                onClick={handleAddProduct}
                className="px-4 py-2 bg-white text-amber-600 hover:bg-amber-50 rounded-lg transition-colors flex items-center gap-2"
              >
                <Plus size={18} />
                <span className="text-sm font-medium">Ajouter produit</span>
              </button>
            </div>
          </div>
        </div>

        {/* Recherche et tri */}
        <div className="p-4 border-b border-amber-100 space-y-3">
          <SearchBar
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Rechercher un produit..."
          />
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 font-medium">Trier par :</span>
            <div className="flex gap-2">
              {[
                { mode: 'category' as SortMode, icon: '📁', label: 'Catégories' },
                { mode: 'alphabetical' as SortMode, icon: '🔤', label: 'A-Z' },
                { mode: 'stock' as SortMode, icon: '⚠️', label: 'Stock' }
              ].map(({ mode, icon, label }) => (
                <button
                  key={mode}
                  onClick={() => setSortMode(mode)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    sortMode === mode
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <span className="mr-1.5">{icon}</span>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Stats et alertes */}
      <div className="space-y-4 mb-6">
        <CollapsibleSection
          title="Nombre de produits par catégorie"
          icon={<BarChart3 size={18} className="text-amber-600" />}
          badge={`${sortedProducts.length}/${products.length} produits`}
          defaultOpen={false}
        >
          <CategoryStatsList stats={categoryStats} showAlerts={false} />
        </CollapsibleSection>

        {lowStockProducts.length === 0 ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="text-green-700 text-sm font-medium">✅ Tous les stocks sont OK</p>
          </div>
        ) : (
          <CollapsibleSection
            title="Alertes Stock"
            icon={<AlertTriangle size={18} className="text-orange-600" />}
            badge={lowStockProducts.length}
            defaultOpen={alertsDefaultOpen}
            className="border-orange-200"
          >
            <div className="space-y-2">
              {lowStockProducts.map(product => {
                const stockInfo = getProductStockInfo(product.id);
                return (
                  <div key={product.id} className="flex items-center justify-between p-2 bg-orange-50 rounded-lg">
                    <span className="text-sm text-gray-700">
                      {product.name} {product.volume && `(${product.volume})`}
                    </span>
                    <span className="text-sm font-medium text-orange-600">
                      {stockInfo?.physicalStock ?? 'N/A'} restant{(stockInfo?.physicalStock ?? 0) > 1 ? 's' : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </CollapsibleSection>
        )}
      </div>

      {/* Table des produits */}
      {sortedProducts.length === 0 ? (
        <EmptyState
          icon={Package}
          message="Aucun produit trouvé"
          subMessage={searchTerm ? "Essayez une autre recherche" : "Commencez par ajouter des produits"}
          action={
            !searchTerm && (
              <button
                onClick={handleAddProduct}
                className="mt-4 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors"
              >
                Ajouter un produit
              </button>
            )
          }
        />
      ) : (
        <div className="bg-white rounded-xl border border-amber-100 overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-amber-100 bg-amber-50">
                <th className="p-4 text-gray-700 font-medium">Produit</th>
                <th className="p-4 text-gray-700 font-medium">Catégorie</th>
                <th className="p-4 text-gray-700 font-medium">Prix vente</th>
                <th className="p-4 text-gray-700 font-medium">Coût moyen</th>
                <th className="p-4 text-gray-700 font-medium">Marge</th>
                <th className="p-4 text-gray-700 font-medium">Stock</th>
                <th className="p-4 text-gray-700 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedProducts.map((product) => {
                const avgCost = getAverageCostPerUnit(product.id);
                const margin = getMargin(product);
                const stockInfo = getProductStockInfo(product.id);

                return (
                  <motion.tr
                    key={product.id}
                    whileHover={{ backgroundColor: '#fef7ed' }}
                    className="border-b border-amber-50"
                  >
                    <td className="p-4">
                      <div>
                        <div className="text-gray-800 font-medium">{product.name}</div>
                        <div className="text-gray-600 text-sm">{product.volume}</div>
                      </div>
                    </td>
                    <td className="p-4 text-gray-700">{getCategoryName(product.categoryId)}</td>
                    <td className="p-4 text-amber-600 font-medium">{formatPrice(product.price)}</td>
                    <td className="p-4 text-gray-700">{avgCost > 0 ? formatPrice(avgCost) : '-'}</td>
                    <td className="p-4">
                      {margin > 0 ? (
                        <span className={`${margin > 50 ? 'text-green-600' : margin > 30 ? 'text-amber-600' : 'text-red-600'}`}>
                          {margin.toFixed(1)}%
                        </span>
                      ) : '-'}
                    </td>
                    <td className="p-4">
                      <span className={`font-bold ${
                        (stockInfo?.physicalStock ?? 0) <= product.alertThreshold ? 'text-red-600' : 'text-gray-800'
                      }`}>
                        {stockInfo?.physicalStock ?? 'N/A'}
                      </span>
                      <div className="text-xs text-gray-500">
                        Dispo: {stockInfo?.availableStock ?? 'N/A'}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEditProduct(product)}
                          className="p-2 text-gray-500 hover:text-amber-600 transition-colors"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteClick(product)}
                          className="p-2 text-gray-500 hover:text-red-600 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modales */}
      <ProductImport isOpen={showProductImport} onClose={() => setShowProductImport(false)} />
      <ProductModal
        isOpen={showProductModal}
        onClose={() => setShowProductModal(false)}
        onSave={(productData) => {
          if (editingProduct) {
            updateProduct(editingProduct.id, productData);
          } else {
            addProduct(productData);
          }
          setShowProductModal(false);
        }}
        categories={categories}
        product={editingProduct}
      />
      <SupplyModal
        isOpen={showSupplyModal}
        onClose={() => setShowSupplyModal(false)}
        onSave={handleSupply}
        products={products}
      />
      <ConfirmationModal
        isOpen={!!productToDelete}
        onClose={() => setProductToDelete(null)}
        onConfirm={handleDeleteConfirm}
        title="Supprimer le produit"
        message={`Êtes-vous sûr de vouloir supprimer ${productToDelete?.name} ? Cette action est irréversible.`}
        confirmLabel="Supprimer"
        isDestructive={true}
        isLoading={isDeleting}
      />
    </div>
  );
}
