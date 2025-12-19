import React, { CSSProperties } from 'react';
import { VirtualizedProductsGrid } from './VirtualizedProductsGrid';
import { PaginationControls } from '../pagination';
import type { PaginationResult } from '../../hooks/useLazyPagination';

export interface PaginatedVirtualizedGridProps<T> {
  items: T[];
  itemWidth: number;
  itemHeight: number;
  columnCount: number;
  height: number;
  width: number | string;
  renderItem: (item: T, style: CSSProperties) => React.ReactNode;
  pagination: PaginationResult<T>;
  showPaginationControls?: boolean;
  className?: string;
  noItemsMessage?: string;
}

/**
 * Composant combinant pagination lazy-loading + virtual scrolling pour grilles
 * Parfait pour catalogues de produits (grille 2-3 colonnes)
 *
 * Performance: 1000 produits en grille 3 colonnes
 * - Sans virtualization: 1000 DOM nodes = très lent
 * - Avec virtualization: 30 DOM nodes = 60 FPS fluide
 *
 * Exemple:
 * ```tsx
 * const pagination = usePaginatedProducts({ barId });
 *
 * <PaginatedVirtualizedGrid
 *   items={pagination.items}
 *   itemWidth={300}
 *   itemHeight={350}
 *   columnCount={3}
 *   height={600}
 *   width="100%"
 *   pagination={pagination}
 *   renderItem={(product, style) => (
 *     <div style={style} key={product.id}>
 *       <ProductCard product={product} />
 *     </div>
 *   )}
 * />
 * ```
 */
export const PaginatedVirtualizedGrid: React.FC<
  PaginatedVirtualizedGridProps<any>
> = ({
  items,
  itemWidth,
  itemHeight,
  columnCount,
  height,
  width,
  renderItem,
  pagination,
  showPaginationControls = true,
  className = '',
  noItemsMessage = 'Aucun élément',
}) => {
  const {
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    currentPageSize,
    totalLoadedItems,
    error,
  } = pagination;

  if (error) {
    return (
      <div className={`p-4 bg-red-50 border border-red-200 rounded-lg ${className}`}>
        <p className="font-medium text-red-700">Erreur lors du chargement</p>
        <p className="text-sm text-red-600 mt-1">{error.message}</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {/* Grille virtualisée */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <VirtualizedProductsGrid
          items={items}
          itemWidth={itemWidth}
          itemHeight={itemHeight}
          columnCount={columnCount}
          height={height}
          width={width}
          renderProduct={renderItem}
          noItemsMessage={noItemsMessage}
          loading={isLoading && items.length === 0}
        />
      </div>

      {/* Pagination controls */}
      {showPaginationControls && (
        <PaginationControls
          onLoadMore={() => fetchNextPage()}
          isLoading={isFetchingNextPage}
          hasNextPage={hasNextPage}
          currentPageSize={currentPageSize}
          totalLoadedItems={totalLoadedItems}
          showIndicator={true}
          showEndMessage={true}
        />
      )}
    </div>
  );
};

PaginatedVirtualizedGrid.displayName = 'PaginatedVirtualizedGrid';
