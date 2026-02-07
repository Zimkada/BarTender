import { useQuery } from '@tanstack/react-query';
import { ServerMappingsService } from '../services/supabase/server-mappings.service';

export const serverMappingsKeys = {
  all: ['serverMappings'] as const,
  forBar: (barId: string) => [...serverMappingsKeys.all, 'bar', barId] as const,
};

/**
 * Hook to fetch server name mappings for a bar
 * Returns an array of server names in alphabetical order
 * Used in simplified mode to populate the server selector dropdown
 */
export function useServerMappings(barId: string | undefined) {
  const { data: mappings = [], isLoading, error } = useQuery({
    queryKey: serverMappingsKeys.forBar(barId || ''),
    queryFn: () => {
      if (!barId) return Promise.resolve([]);
      return ServerMappingsService.getAllMappingsForBar(barId);
    },
    enabled: !!barId,
  });

  // Extract just the server names (already sorted by the service)
  const serverNames = mappings.map(m => m.serverName);

  return { serverNames, mappings, isLoading, error };
}
