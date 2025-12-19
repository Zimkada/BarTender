import React from 'react';
import { usePaginatedProducts } from '../../hooks/usePaginatedProducts';
import { PaginatedVirtualizedGrid } from '../virtualization';

export interface PaginatedVirtualizedProductsExampleProps {
  barId: string;
  impersonatingUserId?: string;
}

/**
 * Exemple complet: Pagination + Virtual Scrolling pour produits
 *
 * Architecture:
 * 1. Pagination charge 50 produits à la fois
 * 2. Virtual scrolling en grille 3 colonnes: affiche ~30 produits (reste en mémoire)
 * 3. Résultat: Load 0.5s + Smooth 60 FPS scrolling
 *
 * Pour catalogue avec 1000 produits:
 * - Sans virtualization: 1000 DOM nodes = très lent
 * - Avec virtualization: 30 DOM nodes = fluide
 */
export const PaginatedVirtualizedProductsExample: React.FC<
  PaginatedVirtualizedProductsExampleProps
> = ({ barId, impersonatingUserId }) => {
  const pagination = usePaginatedProducts({
    barId,
    impersonatingUserId,
    enabled: true,
  });
  const { items } = pagination;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold mb-2">Catalogue de produits</h2>
        <p className="text-sm text-gray-600">
          Pagination lazy-loading + Virtual scrolling en grille
        </p>
      </div>

      <PaginatedVirtualizedGrid
        items={items}
        itemWidth={280}
        itemHeight={320}
        columnCount={3}
        height={700}
        width="100%"
        pagination={pagination}
        renderItem={(product, style) => (
          <div
            key={product.id}
            style={style}
            className="p-3 hover:shadow-lg transition-shadow"
          >
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden h-full flex flex-col hover:border-gray-300">
              {/* Image */}
              <div className="bg-gray-100 h-32 overflow-hidden flex items-center justify-center">
                {product.local_image ? (
                  <img
                    src={product.local_image}
                    alt={product.display_name}
                    className="w-full h-full object-cover"
                  />
                ) : product.local_image === null ? (
                  <div className="text-gray-400 text-sm text-center px-2">
                    Pas d'image
                  </div>
                ) : (
                  <div className="text-gray-400 text-sm">Chargement...</div>
                )}
              </div>

              {/* Contenu */}
              <div className="p-3 flex-1 flex flex-col">
                <h3 className="font-semibold text-gray-900 text-sm truncate mb-1">
                  {product.display_name}
                </h3>

                <p className="text-xs text-gray-600 mb-2">
                  {product.category_name || 'Sans catégorie'}
                </p>

                {/* Prix et stock */}
                <div className="mt-auto pt-2 border-t border-gray-100">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-bold text-gray-900">
                      {product.price}€
                    </span>
                    <span className="text-xs text-gray-600">
                      Vol: {product.volume || '-'}
                    </span>
                  </div>

                  {/* Barre de stock */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          product.stock > product.alert_threshold
                            ? 'bg-green-500'
                            : 'bg-red-500'
                        }`}
                        style={{
                          width: `${Math.min(
                            (product.stock /
                              (product.alert_threshold + 10)) *
                              100,
                            100
                          )}%`,
                        }}
                      />
                    </div>
                    <span
                      className={`text-xs font-medium ${
                        product.stock > product.alert_threshold
                          ? 'text-green-700'
                          : 'text-red-700'
                      }`}
                    >
                      {product.stock}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        showPaginationControls={true}
        noItemsMessage="Aucun produit"
      />
    </div>
  );
};

PaginatedVirtualizedProductsExample.displayName =
  'PaginatedVirtualizedProductsExample';
