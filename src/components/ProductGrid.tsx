import { ProductCard } from './ProductCard';
import { EmptyProductsState } from './EmptyProductsState';
import { Product } from '../types';

interface ProductGridProps {
  products: Product[];
  onAddToCart: (product: Product) => void;
  isLoading?: boolean;
  categoryName?: string;
  onAddProduct?: () => void;
}

export function ProductGrid({
  products,
  onAddToCart,
  isLoading = false,
  categoryName,
  onAddProduct
}: ProductGridProps) {
  // Option C: Condition intelligente - Afficher l'état vide uniquement si pas de produits
  // Si des produits existent, les afficher immédiatement (pas de spinner pendant le chargement)
  if (products.length === 0) {
    return (
      <EmptyProductsState
        isLoading={isLoading}
        categoryName={categoryName}
        onAddProduct={onAddProduct}
      />
    );
  }

  // Si on a des produits, les afficher directement (même si isLoading=true)
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
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