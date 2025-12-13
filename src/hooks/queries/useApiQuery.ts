import { useQuery, UseQueryOptions, UseQueryResult } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';

/**
 * Unified API query hook that automatically handles impersonation context
 *
 * This hook encapsulates useQuery from React Query and automatically:
 * - Detects if the user is impersonating another user
 * - Passes the impersonating user ID to service functions
 * - Ensures consistent impersonation behavior across all data fetches
 *
 * Usage:
 * const { data, isLoading } = useApiQuery(
 *   ['products', barId],
 *   () => ProductsService.getBarProducts(barId, impersonatingUserId)
 * );
 */

interface UseApiQueryOptions<TData, TError = Error>
  extends Omit<UseQueryOptions<TData, TError>, 'queryFn' | 'queryKey'> {
  // No additional options needed - we inherit from UseQueryOptions
}

export function useApiQuery<TData = unknown, TError = Error>(
  queryKey: any[],
  queryFn: (impersonatingUserId?: string) => Promise<TData>,
  options?: UseApiQueryOptions<TData, TError>
): UseQueryResult<TData, TError> {
  const { isImpersonating, currentSession } = useAuth();

  // Get impersonating user ID if in impersonation mode
  const impersonatingUserId = isImpersonating ? currentSession?.userId : undefined;

  // Call queryFn with impersonatingUserId parameter
  const wrappedQueryFn = () => queryFn(impersonatingUserId);

  return useQuery({
    queryKey,
    queryFn: wrappedQueryFn,
    ...options,
  });
}

/**
 * Alternative hook for queries that don't need impersonation support
 * Use this when the query function doesn't accept impersonatingUserId parameter
 */
export function useApiQuerySimple<TData = unknown, TError = Error>(
  queryKey: any[],
  queryFn: () => Promise<TData>,
  options?: UseApiQueryOptions<TData, TError>
): UseQueryResult<TData, TError> {
  return useQuery({
    queryKey,
    queryFn,
    ...options,
  });
}
