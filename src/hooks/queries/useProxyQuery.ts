import { useQuery, UseQueryOptions, UseQueryResult } from '@tanstack/react-query';
import { useActingAs } from '../../context/ActingAsContext';
import { useAuth } from '../../context/AuthContext';

/**
 * useProxyQuery
 * 
 * A higher-order hook that automatically routes queries to either:
 * 1. The standard fetcher (when acting as oneself)
 * 2. The proxy fetcher (when acting as another user)
 * 
 * @param queryKey The base query key
 * @param standardFetcher Function to fetch data normally
 * @param proxyFetcher Function to fetch data via proxy RPC. Receives (userId, barId) as arguments.
 * @param options React Query options
 */
export function useProxyQuery<TData = any, TError = unknown>(
    queryKey: any[],
    standardFetcher: () => Promise<TData>,
    proxyFetcher: (userId: string, barId: string) => Promise<TData>,
    options?: Omit<UseQueryOptions<TData, TError>, 'queryKey' | 'queryFn'>
): UseQueryResult<TData, TError> {
    const { actingAs } = useActingAs();
    const { currentSession } = useAuth();

    // Construct a unique query key that includes the acting state
    // This ensures cache separation between "My Data" and "Impersonated Data"
    const finalQueryKey = [
        ...queryKey,
        actingAs.isActive ? `proxy:${actingAs.userId}` : 'standard'
    ];

    return useQuery({
        queryKey: finalQueryKey,
        queryFn: async () => {
            // 🎭 MODE PROXY : Si l'impersonation est active
            if (actingAs.isActive && actingAs.userId && actingAs.barId) {
                return proxyFetcher(actingAs.userId, actingAs.barId);
            }

            // 👤 MODE NORMAL : Appel standard
            return standardFetcher();
        },
        ...options
    });
}
