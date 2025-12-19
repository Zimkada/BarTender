import React from 'react';
import { LoadMoreButton, type LoadMoreButtonProps } from './LoadMoreButton';
import {
  PaginationIndicator,
  type PaginationIndicatorProps,
} from './PaginationIndicator';
import { EndOfList, type EndOfListProps } from './EndOfList';

export interface PaginationControlsProps {
  onLoadMore: () => void;
  isLoading: boolean;
  disabled?: boolean;
  hasNextPage?: boolean;
  currentPageSize?: number;
  totalLoadedItems?: number;
  showIndicator?: boolean;
  showEndMessage?: boolean;
  endMessageProps?: Partial<EndOfListProps>;
  buttonProps?: Partial<LoadMoreButtonProps>;
  indicatorProps?: Partial<PaginationIndicatorProps>;
  className?: string;
}

/**
 * Composant composé qui combine LoadMoreButton + PaginationIndicator + EndOfList
 * Simplifie l'intégration de la pagination lazy-loading dans les listes
 */
export const PaginationControls: React.FC<PaginationControlsProps> = ({
  onLoadMore,
  isLoading,
  disabled = false,
  hasNextPage = true,
  currentPageSize,
  totalLoadedItems,
  showIndicator = true,
  showEndMessage = true,
  endMessageProps = {},
  buttonProps = {},
  indicatorProps = {},
  className,
}) => {
  const endReached = currentPageSize && currentPageSize < 50;
  const showEnd = showEndMessage && endReached && !isLoading;

  return (
    <div className={`flex flex-col gap-4 ${className || ''}`}>
      {showIndicator && (
        <PaginationIndicator
          currentPageSize={currentPageSize}
          totalLoadedItems={totalLoadedItems}
          hasNextPage={hasNextPage}
          isLoading={isLoading}
          {...indicatorProps}
        />
      )}

      {!showEnd && hasNextPage && (
        <LoadMoreButton
          onClick={onLoadMore}
          isLoading={isLoading}
          disabled={disabled}
          hasNextPage={hasNextPage}
          currentPageSize={currentPageSize}
          totalLoadedItems={totalLoadedItems}
          {...buttonProps}
        />
      )}

      {showEnd && (
        <EndOfList
          show={true}
          itemCount={totalLoadedItems}
          {...endMessageProps}
        />
      )}
    </div>
  );
};

PaginationControls.displayName = 'PaginationControls';
