import { useQuery } from '@tanstack/react-query';
import { ServerMappingsService } from '../services/supabase/server-mappings.service';

export const serverMappingsKeys = {
  all: ['serverMappings'] as const,
  forBar: (barId: string) => [...serverMappingsKeys.all, 'bar', barId] as const,
  forBarWithInactive: (barId: string) =>
    [...serverMappingsKeys.all, 'bar', barId, 'withInactive'] as const,
};

/**
 * Hook to fetch server name mappings for a bar
 *
 * @param includeInactive
 *   false (défaut) → mappings ACTIFS seulement. Pour le sélecteur de caisse :
 *     un serveur retiré ou promu gérant ne doit plus être sélectionnable.
 *   true → TOUS les mappings, y compris les inactifs. Nécessaire pour résoudre
 *     le nom affiché des bons ouverts (useTickets) : un bon laissé par un
 *     serveur parti doit garder son libellé, sinon il devient anonyme et
 *     personne ne sait à quelle table réclamer l'encaissement.
 *
 * Les deux variantes ont des clés de cache distinctes : elles ne retournent pas
 * le même jeu de données et ne doivent pas se recouvrir.
 */
export function useServerMappings(barId: string | undefined, includeInactive = false) {
  const { data: mappings = [], isLoading, error } = useQuery({
    queryKey: includeInactive
      ? serverMappingsKeys.forBarWithInactive(barId || '')
      : serverMappingsKeys.forBar(barId || ''),
    queryFn: () => {
      if (!barId) return Promise.resolve([]);
      return ServerMappingsService.getAllMappingsForBar(barId, includeInactive);
    },
    enabled: !!barId,
  });

  // Extract just the server names (already sorted by the service)
  const serverNames = mappings.map(m => m.serverName);

  return { serverNames, mappings, isLoading, error };
}
