import React from 'react';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';

export interface LoadMoreButtonProps {
  onClick: () => void;
  isLoading: boolean;
  disabled?: boolean;
  hasNextPage?: boolean;
  currentPageSize?: number;
  totalLoadedItems?: number;
  className?: string;
}

/**
 * Bouton "Charger plus" pour la pagination lazy-loading
 * Affiche l'état de chargement et peut être désactivé si pas de page suivante
 */
export const LoadMoreButton: React.FC<LoadMoreButtonProps> = ({
  onClick,
  isLoading,
  disabled = false,
  hasNextPage = true,
  currentPageSize,
  totalLoadedItems,
  className,
}) => {
  const isDisabled = disabled || !hasNextPage || isLoading;

  return (
    <div className={`flex items-center justify-center py-6 ${className || ''}`}>
      <Button
        onClick={onClick}
        disabled={isDisabled}
        variant={isLoading ? 'secondary' : 'default'}
        size="lg"
        className="gap-2"
      >
        {isLoading && <Spinner size="sm" variant="white" />}
        {isLoading ? 'Chargement...' : 'Charger plus'}
      </Button>

      {currentPageSize !== undefined && totalLoadedItems !== undefined && (
        <span className="ml-4 text-sm text-gray-600">
          {totalLoadedItems} éléments chargés
          {currentPageSize === 50 && totalLoadedItems !== 0 && ' (cliquez pour charger plus)'}
        </span>
      )}
    </div>
  );
};

LoadMoreButton.displayName = 'LoadMoreButton';
