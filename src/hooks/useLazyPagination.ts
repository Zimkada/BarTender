/**
 * useLazyPagination.ts
 * Hook réutilisable pour gérer la pagination lazy-loading avec React Query
 * Supporté offset-based et cursor-based pagination
 *
 * Phase 3.4.3 - Lazy-Loading UI
 */

import { useState, useCallback } from 'react';
import { useInfiniteQuery, UseInfiniteQueryResult } from '@tanstack/react-query';

export interface PaginationOptions {
  limit?: number;
  enabled?: boolean;
}

export interface CursorPaginationState {
  date?: string;
  id?: string;
}

export interface PaginationResult<T> {
  items: T[];
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean | undefined;
  hasPreviousPage: boolean | undefined;
  fetchNextPage: () => Promise<any>;
  fetchPreviousPage: () => Promise<any>;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<any>;
  currentPageSize: number;
  totalLoadedItems: number;
}

/**
 * Hook pour la pagination lazy-loading avec offset
 * @param queryKey - Clé React Query unique pour cette requête
 * @param fetchFn - Fonction asynchrone (limit, offset) => Promise<T[]>
 * @param options - Configuration de pagination
 */
export function useLazyOffsetPagination<T>(
  queryKey: (string | number)[],
  fetchFn: (limit: number, offset: number) => Promise<T[]>,
  options: PaginationOptions = {}
): PaginationResult<T> {
  const limit = options.limit || 50;
  const enabled = options.enabled !== false;

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    hasPreviousPage,
    fetchNextPage,
    fetchPreviousPage,
    isError,
    error,
    refetch,
  } = useInfiniteQuery({
    queryKey: [...queryKey, 'offset', limit],
    queryFn: async ({ pageParam = 0 }) => {
      const items = await fetchFn(limit, pageParam);
      return {
        items,
        nextOffset: items.length === limit ? pageParam + limit : undefined,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    getPreviousPageParam: (firstPage, allPages) => {
      if (allPages.length <= 1) return undefined;
      return Math.max(0, (allPages.length - 1) * limit - limit);
    },
    enabled,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const items = data?.pages.flatMap((page) => page.items) ?? [];
  const totalLoadedItems = items.length;
  const currentPageSize = data?.pages[data.pages.length - 1]?.items.length ?? limit;

  return {
    items,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    hasPreviousPage,
    fetchNextPage,
    fetchPreviousPage,
    isError,
    error: error as Error | null,
    refetch,
    currentPageSize,
    totalLoadedItems,
  };
}

/**
 * Hook pour la pagination lazy-loading avec cursor
 * @param queryKey - Clé React Query unique pour cette requête
 * @param fetchFn - Fonction asynchrone (limit, cursor?) => Promise<T[]> où T contient cursor
 * @param options - Configuration de pagination
 */
export function useLazyCursorPagination<T extends { cursor?: CursorPaginationState }>(
  queryKey: (string | number)[],
  fetchFn: (limit: number, cursor?: CursorPaginationState) => Promise<T[]>,
  options: PaginationOptions = {}
): PaginationResult<T> {
  const limit = options.limit || 50;
  const enabled = options.enabled !== false;

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    hasPreviousPage,
    fetchNextPage,
    fetchPreviousPage,
    isError,
    error,
    refetch,
  } = useInfiniteQuery({
    queryKey: [...queryKey, 'cursor', limit],
    queryFn: async ({ pageParam = null }) => {
      const items = await fetchFn(limit, pageParam);

      // Extract cursor from last item of the page
      const lastItem = items[items.length - 1];
      const cursor = lastItem?.cursor;

      return {
        items,
        cursor,
      };
    },
    getNextPageParam: (lastPage) => {
      // Si dernière page est complète ET on a un cursor, il y a probablement une page suivante
      if (lastPage.items.length === limit && lastPage.cursor) {
        return lastPage.cursor;
      }
      return undefined;
    },
    getPreviousPageParam: () => {
      // Cursor pagination ne supporte généralement pas la pagination arrière facilement
      return undefined;
    },
    enabled,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const items = data?.pages.flatMap((page) => page.items) ?? [];
  const totalLoadedItems = items.length;
  const currentPageSize = data?.pages[data.pages.length - 1]?.items.length ?? limit;

  return {
    items,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    hasPreviousPage,
    fetchNextPage,
    fetchPreviousPage: () => Promise.reject('Cursor pagination does not support backwards'),
    isError,
    error: error as Error | null,
    refetch,
    currentPageSize,
    totalLoadedItems,
  };
}
