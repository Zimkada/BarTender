import React from 'react';

export interface PaginationIndicatorProps {
  currentPageSize?: number;
  totalLoadedItems?: number;
  hasNextPage?: boolean;
  isLoading?: boolean;
  className?: string;
}

/**
 * Affiche les statistiques de pagination
 * Ex: "50 of 1000+ loaded" ou "Fin de la liste"
 */
export const PaginationIndicator: React.FC<PaginationIndicatorProps> = ({
  currentPageSize,
  totalLoadedItems,
  hasNextPage,
  isLoading,
  className,
}) => {
  if (currentPageSize === undefined || totalLoadedItems === undefined) {
    return null;
  }

  const endReached = currentPageSize < 50; // Limit par défaut est 50
  const isAtEnd = !hasNextPage && !isLoading;

  return (
    <div
      className={`flex items-center justify-center py-4 px-4 text-sm text-gray-600 ${
        className || ''
      }`}
    >
      {isAtEnd && endReached ? (
        <span className="font-medium text-gray-700">
          ✓ Fin de la liste ({totalLoadedItems} éléments)
        </span>
      ) : (
        <span>
          {totalLoadedItems} éléments chargés
          {hasNextPage && ' • Plus disponibles'}
        </span>
      )}
    </div>
  );
};

PaginationIndicator.displayName = 'PaginationIndicator';
