/**
 * useIngredientMutations
 * Couche MUTATIONS du module cuisine (§13.15, architecture 3 couches).
 *
 * ⚠️ Toutes les écritures passent par les RPC SECURITY DEFINER — `authenticated`
 * n'a que SELECT sur ces tables. Ces hooks n'ajoutent donc AUCUNE logique métier :
 * ils orchestrent l'appel, l'invalidation du cache et le retour utilisateur.
 *
 * ⚠️ PAS D'OPTIMISTIC UPDATE, contrairement aux ventes.
 * Le résultat d'une consommation FEFO dépend de l'état réel des lots (quel lot
 * est entamé, à quel prix, une dette est-elle créée). L'anticiper côté client
 * afficherait un coût matière FAUX pendant quelques centaines de millisecondes —
 * or c'est précisément le chiffre que le module promet d'être juste (§8).
 * On attend le serveur : la vérité vient du calcul, pas d'une estimation.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useBarContext } from '../../context/BarContext';
import { getErrorMessage } from '../../utils/errorHandler';
import { generateUUID } from '../../utils/crypto';
import { ingredientKeys } from '../queries/useIngredientsQueries';
import {
  IngredientsService,
  type DiscardReason,
  type SupplyResult,
  type ConsumeResult,
  type DiscardResult,
  type IngredientInput,
  type IngredientRow,
} from '../../services/supabase/ingredients.service';

export interface ReceiveSupplyInput {
  ingredientId: string;
  qty: number;
  unitCost: number;
  expiresAt?: string;
  businessDate?: string;
  notes?: string;
  /**
   * ⭐ UUID généré par l'appelant AVANT l'appel, et STABLE entre les retries.
   * Omis, un UUID est créé ici — ce qui protège du retry réseau mais PAS du
   * double-clic (chaque clic génèrerait sa propre clé). Un formulaire doit
   * donc fournir la sienne, fixée à l'ouverture.
   */
  idempotencyKey?: string;
}

export interface ConsumeInput {
  items: Array<{ ingredient_id: string; qty: number }>;
  referenceKey: string;
  referenceType?: 'kitchen_order_item' | 'production_batch' | 'inventory_adjustment' | 'manual';
  businessDate?: string;
}

export interface DiscardInput {
  lotId: string;
  reason: DiscardReason;
  notes?: string;
  businessDate?: string;
}

export function useIngredientMutations() {
  const queryClient = useQueryClient();
  const { currentBar } = useBarContext();

  /**
   * Invalide le cache après une écriture de stock.
   *
   * ⚠️ Invalidation LARGE (`ingredientKeys.all`) et non ciblée, volontairement :
   * une seule opération touche les lots, le cache `current_stock` de
   * l'ingrédient, les alertes de péremption et potentiellement les dettes.
   * Énumérer ces clés une par une créerait un point d'oubli à chaque nouvelle
   * query — et un stock affiché faux est pire qu'un refetch de plus.
   *
   * ⭐ Le coût reste borné : ces queries ne sont montées que sur les écrans
   * cuisine, et uniquement si `hasRestaurant` (§3).
   *
   * ⚠️ Branchée sur `onSettled` et NON `onSuccess` : une mutation peut réussir
   * CÔTÉ SERVEUR puis échouer côté réseau (timeout après le commit, coupure).
   * Le RPC est transactionnel, donc la base est cohérente — mais le cache
   * client, lui, resterait périmé et afficherait un stock faux. Invalider dans
   * les deux cas coûte un refetch ; ne pas le faire coûte un chiffre faux.
   */
  const invalidateKitchenStock = () => {
    queryClient.invalidateQueries({ queryKey: ingredientKeys.all });
  };

  /**
   * Enregistre un approvisionnement.
   * Le RPC solde les dettes ouvertes AVANT de créer le lot (§13.2).
   */
  const receiveSupply = useMutation<SupplyResult, Error, ReceiveSupplyInput>({
    meta: { suppressGlobalError: true }, // onError local gère le toast
    mutationFn: async (input) => {
      const barId = currentBar?.id;
      if (!barId) throw new Error('Aucun bar sélectionné');

      return IngredientsService.receiveSupply({
        barId,
        ingredientId: input.ingredientId,
        qty: input.qty,
        unitCost: input.unitCost,
        idempotencyKey: input.idempotencyKey ?? generateUUID(),
        expiresAt: input.expiresAt,
        businessDate: input.businessDate,
        notes: input.notes,
      });
    },
    onSettled: invalidateKitchenStock,
    onSuccess: (result) => {
      import('react-hot-toast').then(({ default: toast }) => {
        // ⚠️ Un rejeu ne doit PAS annoncer un second approvisionnement : le
        // gérant croirait avoir saisi deux livraisons.
        if (result.idempotent_replay) {
          toast('Approvisionnement déjà enregistré', { icon: 'ℹ️' });
          return;
        }

        // ⭐ Le solde d'une dette est une information à REMONTER, pas à taire :
        // il signale qu'on avait consommé sans stock. Le passer sous silence
        // ferait disparaître l'anomalie que §13.2 veut rendre visible.
        if (result.qty_settled_debts && result.qty_settled_debts > 0) {
          toast.success(
            `Appro enregistré — ${result.qty_settled_debts} unité(s) ont soldé un manque de stock antérieur`,
            { duration: 6000 }
          );
          return;
        }

        toast.success('Approvisionnement enregistré');
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
   * Consomme des ingrédients en FEFO.
   *
   * ⚠️ JAMAIS BLOQUANT (§4.4) : un stock insuffisant crée une DETTE, la
   * consommation réussit. Le hook doit donc traiter `qty_from_debt > 0` comme
   * un AVERTISSEMENT, pas comme une erreur.
   */
  const consumeIngredients = useMutation<ConsumeResult, Error, ConsumeInput>({
    meta: { suppressGlobalError: true },
    mutationFn: async (input) => {
      const barId = currentBar?.id;
      if (!barId) throw new Error('Aucun bar sélectionné');

      return IngredientsService.consumeFefo({
        barId,
        items: input.items,
        referenceKey: input.referenceKey,
        referenceType: input.referenceType,
        businessDate: input.businessDate,
      });
    },
    onSettled: invalidateKitchenStock,
    onSuccess: (result) => {
      if (result.idempotent_replay) return; // Rejeu : rien de neuf à annoncer

      // ⭐ Le stock négatif est SILENCIEUX côté base (§4.4) mais doit être
      // VISIBLE côté humain — sinon il s'accumule sans que personne n'agisse,
      // et le coût matière dérive avec lui.
      //
      // ⚠️ `?? []` : sur le chemin de rejeu, `items` provient d'un `jsonb_agg`
      // qui retourne NULL si aucune ligne n'est agrégée. Le garde `v_existing > 0`
      // du RPC rend ce cas inatteignable aujourd'hui — mais cette garantie repose
      // sur deux blocs SQL séparés, et un TypeError ici casserait l'écran entier
      // pour une raison invisible. Le coût de la garde est nul.
      const withDebt = (result.items ?? []).filter((item) => (item.qty_from_debt ?? 0) > 0);

      if (withDebt.length > 0) {
        import('react-hot-toast').then(({ default: toast }) => {
          toast(
            `Stock insuffisant sur ${withDebt.length} ingrédient(s) : consommation enregistrée, à régulariser au prochain appro.`,
            { icon: '⚠️', duration: 7000 }
          );
        });
      }
    },
    onError: (error) => {
      const msg = getErrorMessage(error);
      import('react-hot-toast').then(({ default: toast }) => {
        toast.error(msg);
      });
    },
  });

  /**
   * Sort un lot du stock et valorise la perte (§8, 5e métrique).
   */
  const discardLot = useMutation<DiscardResult, Error, DiscardInput>({
    meta: { suppressGlobalError: true },
    mutationFn: async (input) => {
      const barId = currentBar?.id;
      if (!barId) throw new Error('Aucun bar sélectionné');

      return IngredientsService.discardLot({
        barId,
        lotId: input.lotId,
        reason: input.reason,
        notes: input.notes,
        businessDate: input.businessDate,
      });
    },
    onSettled: invalidateKitchenStock,
    onSuccess: (result) => {
      import('react-hot-toast').then(({ default: toast }) => {
        if (result.idempotent_replay) {
          // ⭐ reason_mismatch : l'appelant demandait une AUTRE cause que celle
          // déjà figée. La perte n'est pas re-catégorisée — le taire ferait
          // croire à une correction réussie, alors que c'est la distinction
          // subie/évitable qui fait la valeur de la métrique.
          if (result.reason_mismatch) {
            toast(
              'Ce lot a déjà été sorti du stock avec un autre motif. La cause enregistrée reste inchangée.',
              { icon: '⚠️', duration: 7000 }
            );
            return;
          }
          toast('Lot déjà sorti du stock', { icon: 'ℹ️' });
          return;
        }

        toast.success(`Lot sorti du stock — perte de ${result.lost_value} enregistrée`);
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
   * Crée ou modifie un ingrédient.
   *
   * ⭐ Chaînon qui MANQUAIT à la phase 1 : sans lui, aucun ingrédient ne
   * pouvait naître hors d'un INSERT manuel en SQL.
   *
   * ⚠️ `onSettled` et non `onSuccess`, comme les autres mutations de ce
   * fichier : une mutation peut réussir CÔTÉ SERVEUR puis échouer côté réseau.
   * Le cache resterait alors périmé et l'ingrédient créé n'apparaîtrait pas.
   */
  const upsertIngredient = useMutation<IngredientRow, Error, IngredientInput>({
    meta: { suppressGlobalError: true }, // onError local gère le toast
    mutationFn: async (ingredient) => {
      const barId = currentBar?.id;
      if (!barId) throw new Error('Aucun bar sélectionné');

      return IngredientsService.upsertIngredient(barId, ingredient);
    },
    onSettled: invalidateKitchenStock,
    onSuccess: (ingredient) => {
      import('react-hot-toast').then(({ default: toast }) => {
        toast.success(`« ${ingredient.name} » enregistré`);
      });
    },
    onError: (error) => {
      const msg = getErrorMessage(error);
      import('react-hot-toast').then(({ default: toast }) => {
        toast.error(msg);
      });
    },
  });

  return { receiveSupply, consumeIngredients, discardLot, upsertIngredient };
}
