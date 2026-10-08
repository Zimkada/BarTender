import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CountersService } from '../../services/supabase/counters.service';
import { QUERY_KEYS } from '../../lib/cache-strategy';
import { useBarContext } from '../../context/BarContext';

/**
 * Mutations sur les comptoirs (chantier comptoirs multiples, 07/10/2026).
 *
 * ⚠️ Toutes invalident `QUERY_KEYS.counters.all` et non la clé précise : la
 * liste des comptoirs d'un bar ET le périmètre de chaque personne en
 * dépendent, et ce périmètre est indexé par utilisateur. Invalider finement
 * laisserait le sélecteur d'une serveuse en retard sur un comptoir qu'on vient
 * de lui ouvrir.
 */
export function useCounterMutations() {
  const queryClient = useQueryClient();
  const { currentBar } = useBarContext();
  const barId = currentBar?.id;

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.counters.all });

  const createCounter = useMutation({
    mutationFn: (name: string) => {
      if (!barId) throw new Error('Aucun bar sélectionné');
      return CountersService.createCounter(barId, name);
    },
    onSuccess: invalidate,
  });

  const renameCounter = useMutation({
    mutationFn: ({ counterId, name }: { counterId: string; name: string }) =>
      CountersService.renameCounter(counterId, name),
    onSuccess: invalidate,
  });

  /**
   * ⛔ Désactivation, JAMAIS suppression : des ventes sont rattachées au
   * comptoir en `ON DELETE RESTRICT`. Un comptoir se retire du service, il ne
   * s'efface pas — sinon on perdrait l'attribution de son historique de caisse.
   */
  const deactivateCounter = useMutation({
    mutationFn: (counterId: string) =>
      CountersService.deactivateCounter(counterId),
    onSuccess: invalidate,
  });

  const assignUser = useMutation({
    mutationFn: ({ counterId, userId }: { counterId: string; userId: string }) => {
      if (!barId) throw new Error('Aucun bar sélectionné');
      return CountersService.assignUser(barId, counterId, userId);
    },
    onSuccess: invalidate,
  });

  const unassignUser = useMutation({
    mutationFn: ({ counterId, userId }: { counterId: string; userId: string }) =>
      CountersService.unassignUser(counterId, userId),
    onSuccess: invalidate,
  });

  return {
    createCounter,
    renameCounter,
    deactivateCounter,
    assignUser,
    unassignUser,
  };
}
