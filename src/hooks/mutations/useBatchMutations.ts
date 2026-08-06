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
  type BatchSource,
  type CloseBatchResult,
  type BatchCloseStatus,
} from '../../services/supabase/batches.service';

interface ProduceBatchInput {
  dishId: string;
  producedQty: number;
  expiresAt?: string | null;
  notes?: string | null;
  /** ⭐ §19.3 — `purchased` pour un lot acheté prêt. Défaut : `produced`. */
  source?: BatchSource;
  /** ⚠️ Prix TOTAL payé — requis pour un lot acheté. */
  totalCost?: number;
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
    mutationFn: async ({ dishId, producedQty, expiresAt, notes, source, totalCost }) => {
      const barId = currentBar?.id;
      if (!barId) throw new Error('Aucun bar sélectionné');

      return BatchesService.produce({
        barId,
        dishId,
        producedQty,
        idempotencyKey: generateUUID(),
        expiresAt,
        notes,
        source,
        totalCost,
      });
    },
    /**
     * ⚠️ Créer un lot touche DEUX univers dans tous les cas — les lots
     * eux-mêmes, et la cuisine (un plat jusque-là sans lot redevient
     * servable). Le TROISIÈME dépend de l'origine, voir plus bas.
     */
    onSettled: (result) => {
      const barId = currentBar?.id ?? '';
      queryClient.invalidateQueries({ queryKey: batchKeys.active(barId) });
      queryClient.invalidateQueries({ queryKey: kitchenKeys.all });
      /**
       * ⚠️ Les INGRÉDIENTS ne sont invalidés que pour un lot PRODUIT (§19.3).
       * Un lot acheté n'en consomme AUCUN : refetcher le stock serait une
       * requête pour rien, sur un écran déjà bavard (§3).
       * ⭐ `!== 'purchased'` et non `=== 'produced'` : si le champ manque
       * (ancienne réponse), on invalide — se tromper par excès est sans
       * conséquence, l'inverse afficherait un stock périmé.
       */
      if (result?.source !== 'purchased') {
        queryClient.invalidateQueries({ queryKey: ingredientKeys.list(barId) });
      }
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
        // ⚠️ Le VERBE suit l'origine : « produit » sur un lot acheté serait
        // faux, et le cuisinier douterait d'avoir saisi la bonne chose.
        const verbe = result.source === 'purchased' ? 'Lot enregistré' : 'Lot produit';
        const base = `${verbe} : ${result.produced_qty} portion${result.produced_qty > 1 ? 's' : ''}`;

        // ⚠️ « de matière » sur un lot acheté serait trompeur : c'est un prix
        // payé, pas une matière sortie du stock.
        const suffixe = result.source === 'purchased' ? 'payés' : 'de matière';

        toast.success(
          canViewCosts && result.total_cost != null
            ? `${base} — ${Math.round(result.total_cost)} F ${suffixe}`
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

  /**
   * Clôture un lot — §13.3, arbitrage du 06/08/2026.
   *
   * ⭐ Rien ne se ferme tout seul dans ce module : c'est le cuisinier qui sait
   * si les spaghettis du matin sont encore bons. Une clôture automatique
   * compterait en perte ce qui est encore utilisable.
   */
  const closeBatch = useMutation<
    CloseBatchResult,
    Error,
    { batchId: string; status: BatchCloseStatus; reason?: string | null }
  >({
    meta: { suppressGlobalError: true },
    mutationFn: async ({ batchId, status, reason }) => {
      const barId = currentBar?.id;
      if (!barId) throw new Error('Aucun bar sélectionné');

      return BatchesService.close({ barId, batchId, status, reason });
    },
    /**
     * ⚠️ Les INGRÉDIENTS ne sont PAS invalidés ici, contrairement à la
     * production : jeter un lot ne restaure aucune matière. Elle est sortie du
     * stock au moment de la production, et un reste jeté est une perte — pas
     * un retour en stock.
     */
    onSettled: () => {
      const barId = currentBar?.id ?? '';
      queryClient.invalidateQueries({ queryKey: batchKeys.active(barId) });
      queryClient.invalidateQueries({ queryKey: kitchenKeys.all });
    },
    onSuccess: (result) => {
      import('react-hot-toast').then(({ default: toast }) => {
        if (result.already_closed) {
          toast('Ce lot était déjà clôturé', { icon: 'ℹ️' });
          return;
        }

        const jetees = result.discarded_qty ?? 0;
        if (jetees <= 0) {
          toast.success('Lot terminé');
          return;
        }

        // ⭐ Le MONTANT perdu n'est annoncé qu'à qui peut voir les montants
        // (§8) ; le nombre de portions, lui, est une information de
        // production que le cuisinier doit avoir.
        const canViewCosts = hasPermission('canViewKitchenCosts');
        const base = `${jetees} portion${jetees > 1 ? 's' : ''} jetée${jetees > 1 ? 's' : ''}`;

        toast(
          canViewCosts && result.loss_amount
            ? `${base} — ${Math.round(result.loss_amount)} F de perte`
            : base,
          { icon: '🗑️', duration: 5000 }
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

  return { produceBatch, closeBatch };
}
