/**
 * useBatchMutations
 * Écriture des lots de production — §16.8, phase 3B.1.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useBarContext } from '../../context/BarContext';
import { useAuth } from '../../context/AuthContext';
import { getErrorMessage } from '../../utils/errorHandler';
import { generateUUID } from '../../utils/crypto';
import { batchKeys } from '../queries/useBatchQueries';
import { kitchenKeys } from '../queries/useKitchenQueries';
import { ingredientKeys } from '../queries/useIngredientsQueries';
import {
  BatchesService,
  type ProduceBatchResult,
} from '../../services/supabase/batches.service';

interface ProduceBatchInput {
  dishId: string;
  producedQty: number;
  expiresAt?: string | null;
  notes?: string | null;
}

export function useBatchMutations() {
  const { currentBar } = useBarContext();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();

  /**
   * Produit un lot : consomme les ingrédients `'batch'` et fige le coût.
   *
   * ⭐⭐ CLÉ D'IDEMPOTENCE GÉNÉRÉE AVANT L'APPEL, jamais côté serveur.
   * ⚠️ Elle est créée DANS `mutationFn`, donc une nouvelle à chaque appel —
   * c'est voulu : deux productions successives volontaires sont deux lots
   * distincts. Ce qu'elle protège, c'est le RETRY réseau d'un même appel, et
   * la double soumission simultanée que l'index unique rattrape en base.
   *
   * ⛔ Sans elle, un double-clic créerait un SECOND lot dont la matière
   * aurait déjà été consommée par le premier : un lot à coût nul, qui
   * fausserait toutes les portions qu'il sert.
   */
  const produceBatch = useMutation<ProduceBatchResult, Error, ProduceBatchInput>({
    meta: { suppressGlobalError: true },
    mutationFn: async ({ dishId, producedQty, expiresAt, notes }) => {
      const barId = currentBar?.id;
      if (!barId) throw new Error('Aucun bar sélectionné');

      return BatchesService.produce({
        barId,
        dishId,
        producedQty,
        idempotencyKey: generateUUID(),
        expiresAt,
        notes,
      });
    },
    /**
     * ⚠️ TROIS caches à invalider — produire un lot touche trois univers :
     *   · les lots eux-mêmes (un nouveau vient d'apparaître) ;
     *   · les INGRÉDIENTS (leur stock vient de baisser en FEFO) ;
     *   · la cuisine (un plat jusque-là sans lot redevient servable).
     * ⛔ Oublier les ingrédients afficherait un stock périmé sur l'écran
     * Ingrédients — celui-là même où le cuisinier va vérifier ce qu'il lui
     * reste après sa production.
     */
    onSettled: () => {
      const barId = currentBar?.id ?? '';
      queryClient.invalidateQueries({ queryKey: batchKeys.active(barId) });
      queryClient.invalidateQueries({ queryKey: ingredientKeys.list(barId) });
      queryClient.invalidateQueries({ queryKey: kitchenKeys.all });
    },
    onSuccess: (result) => {
      import('react-hot-toast').then(({ default: toast }) => {
        // ⚠️ Un rejeu n'est PAS une production : le dire franchement évite
        // que le cuisinier croie avoir fait deux lots.
        if (result.idempotent_replay) {
          toast('Ce lot avait déjà été enregistré', { icon: 'ℹ️' });
          return;
        }

        // ⭐ Le coût n'est annoncé qu'à qui a le droit de voir les montants
        // (§8) — le compteur de portions, lui, est une information de
        // production que tout le monde peut lire.
        const canViewCosts = hasPermission('canViewKitchenCosts');
        const base = `Lot produit : ${result.produced_qty} portion${result.produced_qty > 1 ? 's' : ''}`;

        toast.success(
          canViewCosts && result.total_cost != null
            ? `${base} — ${Math.round(result.total_cost)} F de matière`
            : base,
          { duration: 5000 }
        );
      });
    },
    onError: (error) => {
      const msg = getErrorMessage(error);
      import('react-hot-toast').then(({ default: toast }) => {
        toast.error(msg);
      });
    },
  });

  return { produceBatch };
}
