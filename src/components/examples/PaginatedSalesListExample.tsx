import React from 'react';
import { usePaginatedSales } from '../../hooks/usePaginatedSales';
import { PaginationControls } from '../pagination';

export interface PaginatedSalesListExampleProps {
  barId: string;
}

/**
 * Exemple d'intégration des composants et hooks de pagination
 * Montre comment utiliser usePaginatedSales + PaginationControls
 *
 * Usage:
 * ```tsx
 * <PaginatedSalesListExample barId={currentBarId} />
 * ```
 */
export const PaginatedSalesListExample: React.FC<
  PaginatedSalesListExampleProps
> = ({ barId }) => {
  const {
    items,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    currentPageSize,
    totalLoadedItems,
    error,
  } = usePaginatedSales({ barId, enabled: true });

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
        <p className="font-medium">Erreur lors du chargement des ventes</p>
        <p className="text-sm mt-1">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Liste des ventes */}
      <div className="space-y-2">
        {isLoading && items.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            Chargement des ventes...
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-8 text-gray-500">Aucune vente</div>
        ) : (
          <div className="space-y-2">
            {items.map((sale) => (
              <div
                key={sale.id}
                className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-gray-900">
                      Vente #{sale.id.slice(0, 8))}
                    </p>
                    <p className="text-sm text-gray-600">
                      {sale.seller_name || 'Inconnu'} • {sale.items_count}{' '}
                      article{sale.items_count > 1 ? 's' : ''}
                    </p>
                  </div>
                  <p className="font-semibold text-gray-900">{sale.total}€</p>
                </div>
              </div>
            ))}
          </div>
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

PaginatedSalesListExample.displayName = 'PaginatedSalesListExample';
