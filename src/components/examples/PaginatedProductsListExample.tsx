import React from 'react';
import { usePaginatedProducts } from '../../hooks/usePaginatedProducts';
import { PaginationControls } from '../pagination';

export interface PaginatedProductsListExampleProps {
  barId: string;
  impersonatingUserId?: string;
}

/**
 * Exemple d'intégration des composants et hooks de pagination pour produits
 * Montre comment utiliser usePaginatedProducts + PaginationControls
 *
 * Usage:
 * ```tsx
 * <PaginatedProductsListExample barId={currentBarId} />
 * ```
 */
export const PaginatedProductsListExample: React.FC<
  PaginatedProductsListExampleProps
> = ({ barId, impersonatingUserId }) => {
  const {
    items,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    currentPageSize,
    totalLoadedItems,
    error,
  } = usePaginatedProducts({ barId, impersonatingUserId, enabled: true });

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
        <p className="font-medium">Erreur lors du chargement des produits</p>
        <p className="text-sm mt-1">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Liste des produits en grille */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading && items.length === 0 ? (
          <div className="col-span-full text-center py-8 text-gray-500">
            Chargement des produits...
          </div>
        ) : items.length === 0 ? (
          <div className="col-span-full text-center py-8 text-gray-500">
            Aucun produit
          </div>
        ) : (
          items.map((product) => (
            <div
              key={product.id}
              className="p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
            >
              {product.local_image && (
                <img
                  src={product.local_image}
                  alt={product.display_name}
                  className="w-full h-32 object-cover rounded-md mb-3"
                />
              )}
              <h3 className="font-medium text-gray-900 truncate">
                {product.display_name}
              </h3>
              <p className="text-sm text-gray-600 mb-2">
                {product.category_name || 'Sans catégorie'}
              </p>
              <div className="flex justify-between items-center">
                <span className="font-semibold text-gray-900">
                  {product.price}€
                </span>
                <span
                  className={`text-sm px-2 py-1 rounded ${
                    product.stock > product.alert_threshold
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  Stock: {product.stock}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination controls */}
      <PaginationControls
        onLoadMore={() => fetchNextPage()}
        isLoading={isFetchingNextPage}
        hasNextPage={hasNextPage}
        currentPageSize={currentPageSize}
        totalLoadedItems={totalLoadedItems}
        showIndicator={true}
        showEndMessage={true}
      />
    </div>
  );
};

PaginatedProductsListExample.displayName = 'PaginatedProductsListExample';
