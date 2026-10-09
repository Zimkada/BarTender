import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ServerMappingsService } from '../services/supabase/server-mappings.service';
import { supabase } from '../lib/supabase';
import { CACHE_STRATEGY } from '../lib/cache-strategy';

export const serverMappingsKeys = {
  all: ['serverMappings'] as const,
  forBar: (barId: string) => [...serverMappingsKeys.all, 'bar', barId] as const,
  forBarWithInactive: (barId: string) =>
    [...serverMappingsKeys.all, 'bar', barId, 'withInactive'] as const,
};

/**
 * ⭐ Affectations actives d'un comptoir, pour filtrer les serveurs proposés
 * a la caisse (09/10/2026).
 *
 * ⚠️ Cle SEPAREE de celles des mappings : elle depend du COMPTOIR, pas du bar.
 * Les melanger ferait servir a un comptoir la liste d'un autre.
 */
export const counterAssignmentKeys = {
  forCounter: (counterId: string) =>
    ['counters', 'assignments', 'byCounter', counterId] as const,
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
export function useServerMappings(
  barId: string | undefined,
  includeInactive = false,
  /**
   * ⭐ Comptoir actif (09/10/2026). Quand il est fourni ET que le bar a
   * PLUSIEURS comptoirs, la liste est reduite aux serveurs qui y sont
   * affectes.
   *
   * ⚠️ `undefined` = aucun filtrage, comportement d'avant. Indispensable pour
   * `useTickets`, qui doit resoudre le nom d'un bon meme laisse par un serveur
   * d'un autre comptoir — sinon le bon devient anonyme et personne ne sait ou
   * reclamer l'encaissement.
   */
  counterId?: string
) {
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

  // Affectations du comptoir actif. Requete distincte et legere (2 colonnes).
  /**
   * ⛔ La queryFn retourne un TABLEAU, jamais un `Set` (crash du 10/10/2026).
   *
   * La cle commence par `counters` : elle est PERSISTEE dans localStorage
   * (`shouldDehydrateQuery`, lib/react-query.ts). JSON transforme un `Set` en
   * `{}` : au rechargement suivant, `assignedUserIds.has` n'existait plus et
   * tout RootLayout plantait, a CHAQUE rechargement.
   */
  const { data: assignedUserIdList } = useQuery({
    queryKey: counterAssignmentKeys.forCounter(counterId || ''),
    queryFn: async (): Promise<string[]> => {
      const { data, error: err } = await supabase
        .from('counter_assignments')
        .select('user_id')
        .eq('counter_id', counterId!)
        .eq('is_active', true);
      if (err) throw err;
      return (data ?? []).map((a) => a.user_id);
    },
    // ⚠️ `!!barId` AUSSI : en mode COMPLET, Cart.tsx passe `barId = undefined`
    // (les mappings ne concernent que le mode simplifie). Sans cette garde,
    // on ferait un aller-retour reseau a chaque ouverture du panier pour une
    // liste dont personne ne se sert.
    enabled: !!counterId && !!barId,
    ...CACHE_STRATEGY.categories,
  });

  // ⚠️ `Array.isArray` absorbe les caches deja corrompus (`{}`) sur les
  // telephones : traites comme « pas encore charge », donc sans filtrage,
  // jusqu'au prochain refetch qui les remplace.
  const assignedUserIds = useMemo(
    () => (Array.isArray(assignedUserIdList) ? new Set(assignedUserIdList) : undefined),
    [assignedUserIdList]
  );

  /**
   * ⛔ Filtrage UNIQUEMENT quand les affectations sont CHARGEES.
   *
   * `assignedUserIds` vaut `undefined` pendant le chargement : filtrer a ce
   * moment-la viderait le selecteur de serveurs, et le gerant croirait qu'il
   * n'a personne a qui attribuer la vente. Mieux vaut montrer brievement la
   * liste complete qu'une liste vide.
   *
   * ⚠️ Un mapping dont le `user_id` n'est affecte a AUCUN comptoir disparait
   * de la caisse. C'est voulu : le trigger `trg_assign_primary_counter` affecte
   * tout membre actif au comptoir principal, donc ce cas signale une anomalie
   * de donnees, pas un usage normal.
   */
  const visibleMappings =
    counterId && assignedUserIds
      ? mappings.filter((m) => assignedUserIds.has(m.userId))
      : mappings;

  // Extract just the server names (already sorted by the service)
  const serverNames = visibleMappings.map(m => m.serverName);

  return { serverNames, mappings: visibleMappings, isLoading, error };
}
