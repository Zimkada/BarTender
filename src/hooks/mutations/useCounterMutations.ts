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

  // ⚠️ `QUERY_KEYS.counters.all` = ['counters'], prefixe qui couvre AUSSI
  // ['counters','assignments',barId] : une seule invalidation suffit.
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

  /**
   * ⭐ Clé du cache des affectations, partagée avec `CountersSection`.
   * Exportée pour que l'optimistic update ci-dessous vise exactement la même
   * entrée que la requête qui alimente l'écran.
   */
  const assignmentsKey = ['counters', 'assignments', barId] as const;

  type Assignment = { counter_id: string; user_id: string };

  /**
   * Mise à jour OPTIMISTE des affectations.
   *
   * ⚠️ Sans elle, cocher une personne enchaîne un aller-retour serveur PUIS
   * une invalidation PUIS un re-fetch avant que la coche ne bouge. Sur une
   * liaison béninoise, le délai se voit : le promoteur clique deux fois,
   * croyant avoir manqué sa cible. Remonté en usage réel le 09/10/2026.
   *
   * Le cache est corrigé immédiatement, puis `onError` restaure l'état
   * d'avant et `onSettled` resynchronise sur le serveur dans tous les cas.
   */
  const patchAssignments = async (
    counterId: string,
    userId: string,
    assign: boolean
  ) => {
    // Empêche un re-fetch en vol d'écraser notre écriture optimiste.
    await queryClient.cancelQueries({ queryKey: assignmentsKey });
    const previous = queryClient.getQueryData<Assignment[]>(assignmentsKey);

    queryClient.setQueryData<Assignment[]>(assignmentsKey, (old = []) =>
      assign
        ? [...old, { counter_id: counterId, user_id: userId }]
        : old.filter(
            (a) => !(a.counter_id === counterId && a.user_id === userId)
          )
    );

    return { previous };
  };

  const rollbackAssignments = (ctx?: { previous?: Assignment[] }) => {
    if (ctx?.previous) {
      queryClient.setQueryData(assignmentsKey, ctx.previous);
    }
  };

  const assignUser = useMutation({
    mutationFn: ({ counterId, userId }: { counterId: string; userId: string }) => {
      if (!barId) throw new Error('Aucun bar sélectionné');
      return CountersService.assignUser(barId, counterId, userId);
    },
    onMutate: ({ counterId, userId }) =>
      patchAssignments(counterId, userId, true),
    onError: (_e, _vars, ctx) => rollbackAssignments(ctx),
    // ⚠️ `onSettled` et non `onSuccess` : en cas d'echec, le rollback remet
    // l'etat local d'avant, mais seul un re-fetch garantit qu'il correspond
    // au serveur.
    onSettled: invalidate,
  });

  const unassignUser = useMutation({
    mutationFn: ({ counterId, userId }: { counterId: string; userId: string }) =>
      CountersService.unassignUser(counterId, userId),
    onMutate: ({ counterId, userId }) =>
      patchAssignments(counterId, userId, false),
    onError: (_e, _vars, ctx) => rollbackAssignments(ctx),
    onSettled: invalidate,
  });

  return {
    createCounter,
    renameCounter,
    deactivateCounter,
    assignUser,
    unassignUser,
  };
}
