import { useCallback } from 'react';
import { SalesService } from '../services/supabase/sales.service';
import {
  useLazyCursorPagination,
  type PaginationResult,
  type CursorPaginationState,
} from './useLazyPagination';
import type { SaleWithDetails } from '../types/sales.types';

export interface UsePaginatedSalesOptions {
  barId: string;
  limit?: number;
  enabled?: boolean;
}

/**
 * Hook métier pour la pagination lazy-loading des ventes
 * Utilise cursor-based pagination (business_date, id) pour O(log n) performance
 * Plus efficace que offset pour les données temps réel avec accumulation
 *
 * Exemple:
 * ```ts
 * const { items, isLoading, hasNextPage, fetchNextPage } = usePaginatedSales({ barId });
 * ```
 */
export function usePaginatedSales(
  options: UsePaginatedSalesOptions
): PaginationResult<SaleWithDetails> {
  const { barId, limit = 50, enabled = true } = options;

  // Fonction fetch qui appelle le service avec cursor pagination
  const fetchSales = useCallback(
    async (
      pageLimit: number,
      cursor?: CursorPaginationState
    ): Promise<SaleWithDetails[]> => {
      return SalesService.getBarSalesCursorPaginated(barId, {
        limit: pageLimit,
        cursorDate: cursor?.date || undefined,
        cursorId: cursor?.id || undefined,
      });
    },
    [barId]
  );

  // Utiliser le hook de pagination avec cursor
  return useLazyCursorPagination(
    ['paginated-sales', barId],
    fetchSales,
    {
      limit,
      enabled,
    }
  );
}
