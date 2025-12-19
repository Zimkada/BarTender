import React, { CSSProperties, useMemo } from 'react';
import { FixedSizeGrid as Grid } from 'react-window';
import type { BarProductWithDetails } from '../../types/products.types';

export interface VirtualizedProductsGridProps {
  items: BarProductWithDetails[];
  itemWidth: number;
  itemHeight: number;
  width: number | string;
  height: number;
  renderProduct: (
    product: BarProductWithDetails,
    style: CSSProperties
  ) => React.ReactNode;
  columnCount?: number;
  overscanCount?: number;
  className?: string;
  noItemsMessage?: string;
  loading?: boolean;
}

/**
 * Composant virtualisé pour grilles de produits
 * Utilise react-window FixedSizeGrid pour rendre seulement items visibles
 *
 * Parfait pour catalogues de produits affichés en grille (2-3 colonnes)
 * Performance: 1000 items en grille = ~30 DOM nodes (au lieu de 1000)
 *
 * Exemple:
 * ```tsx
 * <VirtualizedProductsGrid
 *   items={products}
 *   itemWidth={300}
 *   itemHeight={350}
 *   columnCount={3}
 *   height={600}
 *   width="100%"
 *   renderProduct={(product, style) => (
 *     <div style={style} key={product.id}>
 *       <ProductCard product={product} />
 *     </div>
 *   )}
 * />
 * ```
 */
export const VirtualizedProductsGrid: React.FC<
  VirtualizedProductsGridProps
> = ({
  items,
  itemWidth,
  itemHeight,
  width,
  height,
  renderProduct,
  columnCount = 3,
  overscanCount = 2,
  className = '',
  noItemsMessage = 'Aucun produit',
  loading = false,
}) => {
  // Calcul du nombre de lignes nécessaires
  const rowCount = useMemo(() => {
    return Math.ceil(items.length / columnCount);
  }, [items.length, columnCount]);

  // Memoize width
  const computedWidth = useMemo(() => {
    if (typeof width === 'number') return width;
    return width === '100%' ? undefined : width;
  }, [width]);

  if (items.length === 0) {
    return (
      <div
        className={`flex items-center justify-center ${className}`}
        style={{ height: `${height}px` }}
      >
        <div className="text-center py-8 text-gray-500">
          {loading ? 'Chargement...' : noItemsMessage}
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <Grid
        columnCount={columnCount}
        columnWidth={itemWidth}
        height={height}
        rowCount={rowCount}
        rowHeight={itemHeight}
        width={computedWidth || '100%'}
        overscanCount={overscanCount}
      >
        {({ columnIndex, rowIndex, style }) => {
          const index = rowIndex * columnCount + columnIndex;
          if (index >= items.length) return null;

          const product = items[index];
          return renderProduct(product, style);
        }}
      </Grid>
    </div>
  );
};

VirtualizedProductsGrid.displayName = 'VirtualizedProductsGrid';
