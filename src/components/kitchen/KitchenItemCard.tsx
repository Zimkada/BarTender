/**
 * KitchenItemCard
 * Une ligne de la file cuisine — §6.1, §9.
 *
 * ⭐⭐ LES ACTIONS DÉPENDENT DU RÔLE, PAS DE LA COLONNE (§6.1)
 * Le cuisinier PRODUIT (`accept`, `mark_ready`), le serveur VEND (`serve`).
 * `canUpdateKitchenOrderStatus` et `canServeKitchenItem` sont volontairement
 * DISJOINTES : « qui produit ne vend pas ». Un même écran, deux métiers, des
 * boutons différents.
 *
 * ⚠️ CE COMPOSANT NE DÉCIDE RIEN : il n'affiche un bouton que si la permission
 * ET le statut l'autorisent. Le RPC retranche de toute façon — l'UI ne fait que
 * cacher ce qui échouerait.
 */

import { memo } from 'react';
import { Check, ChefHat, HandPlatter, X, Clock } from 'lucide-react';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';
import type { KitchenQueueItem } from '../../services/supabase/kitchen.service';

interface Props {
  item: KitchenQueueItem;
  /** `accept` et `mark_ready` — cuisinier, gérant, promoteur. */
  canProduce: boolean;
  /** `serve` — serveur, gérant, promoteur. PAS le cuisinier (§6.1). */
  canServe: boolean;
  canCancel: boolean;
  /**
   * ⭐⭐ BORNE TEMPORELLE du §6.1 — distincte de `canCancel`.
   *
   * Après `ready` la matière est SORTIE : annuler devient une décision
   * sanitaire ou commerciale (« ce plat part-il à la poubelle ? »), plus
   * opérationnelle. Le RPC ne l'autorise donc qu'aux rôles de gestion.
   *
   * ⚠️ Le §6.1 le dit explicitement : la permission `canCancelKitchenOrderItem`
   * « n'est que le PREMIER filtre ». Le cuisinier la possède — il peut annuler
   * ce qui n'est pas encore prêt — mais pas franchir cette borne.
   *
   * ⛔ Sans cette distinction, le bouton s'affichait sur une ligne `ready` pour
   * le cuisinier et échouait systématiquement côté serveur : l'interdit se
   * découvrait par un message d'erreur, après le geste.
   */
  canCancelAfterReady: boolean;
  onAccept: (itemId: string) => void;
  onMarkReady: (itemId: string) => void;
  onServe: (itemId: string) => void;
  onCancel: (item: KitchenQueueItem) => void;
  /** Désactive les boutons pendant une transition en vol. */
  isPending: boolean;
}

/**
 * Ancienneté en minutes, arrondie.
 * ⚠️ Calculée au RENDU et non stockée : une durée figée vieillirait à l'écran
 * sans que le chiffre bouge.
 */
function minutesSince(iso: string): number {
  const elapsed = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(elapsed / 60000));
}

/**
 * ⭐ Seuils d'attente. Le §9 veut un signal d'ATTENTE visible, pas une alerte
 * permanente : au-delà de 20 min une commande devient un problème de service.
 */
const WARN_MINUTES = 12;
const LATE_MINUTES = 20;

export const KitchenItemCard = memo<Props>(function KitchenItemCard({
  item,
  canProduce,
  canServe,
  canCancel,
  canCancelAfterReady,
  onAccept,
  onMarkReady,
  onServe,
  onCancel,
  isPending,
}) {
  const waiting = minutesSince(item.order_created_at);
  const isLate = waiting >= LATE_MINUTES;
  const isWarn = !isLate && waiting >= WARN_MINUTES;

  // ⚠️ Les modificateurs sont l'information qui coûte le plus cher quand elle
  // est manquée (§9) : « sans piment » raté, c'est une assiette refaite.
  const modifiers = Array.isArray(item.modifiers)
    ? (item.modifiers as unknown[]).filter((m): m is string => typeof m === 'string')
    : [];

  return (
    <div
      className={cn(
        'rounded-lg border bg-white p-3 transition-colors dark:bg-gray-800',
        isLate
          ? 'border-red-300 dark:border-red-800'
          : 'border-gray-200 dark:border-gray-700'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-gray-900 dark:text-gray-100">
            {/* ⭐ La quantité AVANT le nom : c'est le nombre d'assiettes à
                sortir, l'information que le cuisinier lit en premier. */}
            {item.quantity > 1 && (
              <span className="mr-1 font-bold">{item.quantity}×</span>
            )}
            {item.dish_name}
          </p>

          {modifiers.length > 0 && (
            <p className="mt-0.5 text-sm font-medium text-amber-700 dark:text-amber-500">
              {modifiers.join(' • ')}
            </p>
          )}
        </div>

        <span
          className={cn(
            'flex shrink-0 items-center gap-1 text-xs tabular-nums',
            isLate
              ? 'font-semibold text-red-600 dark:text-red-400'
              : isWarn
                ? 'text-amber-600 dark:text-amber-500'
                : 'text-gray-400'
          )}
        >
          <Clock className="h-3 w-3" />
          {waiting} min
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {/* ⭐ « À faire » → le cuisinier prend la ligne en charge. */}
        {canProduce && (item.status === 'pending' || item.status === 'accepted') && (
          <Button size="sm" onClick={() => onAccept(item.id)} disabled={isPending}>
            <ChefHat className="mr-1 h-4 w-4" />
            Commencer
          </Button>
        )}

        {/* ⭐⭐ C'est ICI que la MATIÈRE sort du stock (§6), pas au service. */}
        {canProduce && item.status === 'preparing' && (
          <Button size="sm" onClick={() => onMarkReady(item.id)} disabled={isPending}>
            <Check className="mr-1 h-4 w-4" />
            Prêt
          </Button>
        )}

        {/* ⭐ C'est ICI que naît le CA. Réservé à qui vend (§6.1). */}
        {canServe && item.status === 'ready' && (
          <Button size="sm" onClick={() => onServe(item.id)} disabled={isPending}>
            <HandPlatter className="mr-1 h-4 w-4" />
            Servir
          </Button>
        )}

        {/* ⭐⭐ MIROIR EXACT de la garde de `cancel_kitchen_item` (§6.1) :
            après `ready`, seuls les rôles de gestion passent. Afficher un
            bouton qui échouera à coup sûr fait découvrir l'interdit APRÈS le
            geste, par un message d'erreur.
            ⚠️ L'UI ne fait que MASQUER : le serveur retranche de toute façon.
            C'est la base qui décide, pas cette condition. */}
        {canCancel && (item.status !== 'ready' || canCancelAfterReady) && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onCancel(item)}
            disabled={isPending}
            className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
          >
            <X className="mr-1 h-4 w-4" />
            Annuler
          </Button>
        )}
      </div>
    </div>
  );
});
