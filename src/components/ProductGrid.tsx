import { useBarContext } from '../context/BarContext';
import { ProductCard } from './ProductCard';
import { EmptyProductsState } from './EmptyProductsState';
import { Product, type CartItem } from '../types';
import { useUnifiedStock } from '../hooks/pivots/useUnifiedStock';
import { ProductGridSkeleton } from './skeletons';

interface ProductGridProps {
  products: Product[];
  /** ⭐ `quantity` REMPLACE la quantité de la ligne (pavé). Absente : +1. */
  onAddToCart: (product: Product, quantity?: number) => void;
  /**
   * Le pavé de quantité est-il proposé sur les cartes ? (défaut : oui)
   *
   * ⛔ `false` pour tout écran qui CHOISIT un produit sans en fixer la
   * quantité — `SwapProductSelector`, dont la quantité vient du retour
   * d'origine. Sans cette porte, le pavé s'y affichait et la quantité saisie
   * était silencieusement jetée par un `onSelect` à un seul argument.
   */
  allowQuantityPad?: boolean;
  cart?: CartItem[];
  isLoading?: boolean;
  isStockLoading?: boolean;
  getAvailableStock?: (productId: string) => number | undefined;
  onAddProduct?: () => void;
  categoryName?: string;
}

function ProductGridWithStockFallback(props: ProductGridProps) {
  const { currentBar } = useBarContext();
  const { getProductStockInfo, isLoading: isLoadingStock } = useUnifiedStock(currentBar?.id);

  return (
    <ProductGridContent
      {...props}
      isStockLoading={isLoadingStock}
      getAvailableStock={(productId) => getProductStockInfo(productId)?.availableStock}
    />
  );
}

function ProductGridContent({
  products,
  onAddToCart,
  cart = [],
  isLoading = false,
  isStockLoading = false,
  getAvailableStock,
  onAddProduct,
  categoryName,
  allowQuantityPad = true
}: ProductGridProps) {
  if (isLoading || isStockLoading) {
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
      {products.map((product, index) => {
        const itemInCart = cart.find(item => item.product.id === product.id);
        const quantityInCart = itemInCart ? itemInCart.quantity : 0;

        return (
          <ProductCard
            key={product.id}
            product={product}
            availableStock={getAvailableStock?.(product.id)}
            quantityInCart={quantityInCart}
            onAddToCart={(_product, quantity) => onAddToCart(product, quantity)}
            allowQuantityPad={allowQuantityPad}
            priority={index < 4}
          />
        );
      })}
    </div>
  );
}

export function ProductGrid(props: ProductGridProps) {
  if (props.getAvailableStock) {
    return <ProductGridContent {...props} />;
  }

  return <ProductGridWithStockFallback {...props} />;
}
