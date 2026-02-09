import { useBarContext } from '../context/BarContext';
import { ProductCard } from './ProductCard';
import { EmptyProductsState } from './EmptyProductsState';
import { Product } from '../types';
import { useUnifiedStock } from '../hooks/pivots/useUnifiedStock';
import { ProductGridSkeleton } from './skeletons';

interface ProductGridProps {
  products: Product[];
  onAddToCart: (product: Product) => void;
  isLoading?: boolean;
  onAddProduct?: () => void;
  categoryName?: string;
}

export function ProductGrid({
  products,
  onAddToCart,
  isLoading = false,
  onAddProduct,
  categoryName
}: ProductGridProps) {
  const { currentBar } = useBarContext();
  const { getProductStockInfo, isLoading: isLoadingStock } = useUnifiedStock(currentBar?.id);

  if (isLoading || isLoadingStock) {
    return <ProductGridSkeleton count={10} />;
  }

  if (products.length === 0) {
    return (
      <EmptyProductsState
        onAction={onAddProduct}
        actionLabel="Ajouter un produit"
        message={categoryName ? `Aucun produit disponible dans "${categoryName}".` : undefined}
      />
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 md:gap-5">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          availableStock={getProductStockInfo(product.id)?.availableStock}
          onAddToCart={() => onAddToCart(product)}
        />
      ))}
    </div>
  );
}