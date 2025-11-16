import { ProductCard } from './ProductCard';
import { Product } from '../types';
import { useViewport } from '../hooks/useViewport';

interface ProductGridProps {
  products: Product[];
  onAddToCart: (product: Product) => void;
}

export function ProductGrid({ products, onAddToCart }: ProductGridProps) {
  const { isMobile } = useViewport();

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="text-6xl mb-4">🍺</div>
        <h3 className="text-xl font-semibold text-gray-600 mb-2">
          Aucun produit dans cette catégorie
        </h3>
        <p className="text-gray-500">
          Ajoutez des produits pour commencer à vendre
        </p>
      </div>
    );
  }

  // ==================== VERSION MOBILE (99% utilisateurs Bénin) ====================
  // Liste verticale 1 colonne, cards XXL pour lisibilité soleil africain
  if (isMobile) {
    return (
      <div className="space-y-3">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            onAddToCart={onAddToCart}
          />
        ))}
      </div>
    );
  }

  // ==================== VERSION DESKTOP (1% promoteurs avec PC) ====================
  // Grid 3 colonnes pour utiliser l'espace disponible
  return (
    <div className="grid grid-cols-3 gap-4">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          onAddToCart={onAddToCart}
        />
      ))}
    </div>
  );
}