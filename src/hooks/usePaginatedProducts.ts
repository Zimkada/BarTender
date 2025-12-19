import { useCallback } from 'react';
import { ProductsService } from '../services/supabase/products.service';
import { useLazyOffsetPagination, type PaginationResult } from './useLazyPagination';
import type { BarProductWithDetails } from '../types/products.types';

export interface UsePaginatedProductsOptions {
  barId: string;
  impersonatingUserId?: string;
  limit?: number;
  enabled?: boolean;
}

/**
 * Hook métier pour la pagination lazy-loading des produits
 * Utilise offset-based pagination car les produits ne changent pas souvent
 * Plus simple et suffisant pour les catalogues de produits
 *
 * Exemple:
 * ```ts
 * const { items, isLoading, hasNextPage, fetchNextPage } = usePaginatedProducts({ barId });
 * ```
 */
export function usePaginatedProducts(
  options: UsePaginatedProductsOptions
): PaginationResult<BarProductWithDetails> {
  const {
    barId,
    impersonatingUserId,
    limit = 50,
    enabled = true,
  } = options;

  // Fonction fetch qui appelle le service avec offset pagination
  const fetchProducts = useCallback(
    async (pageLimit: number, offset: number): Promise<BarProductWithDetails[]> => {
      return ProductsService.getBarProducts(barId, impersonatingUserId, {
        limit: pageLimit,
        offset,
      });
    },
    [barId, impersonatingUserId]
  );

  // Utiliser le hook de pagination avec offset
  return useLazyOffsetPagination(
    ['paginated-products', barId, impersonatingUserId || 'none'],
    fetchProducts,
    {
      limit,
      enabled,
    }
  );
}
