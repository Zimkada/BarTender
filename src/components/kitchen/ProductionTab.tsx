/**
 * ProductionTab
 * Les lots de production — §16.8, phase 3B.1.
 *
 * ⭐⭐ CE QUE CET ÉCRAN APPORTE
 * Le cuisinier braise 20 poulets le matin. Sans lui, cette production n'existe
 * nulle part : la matière sort du stock sans qu'on sache ce qu'elle est
 * devenue, et les plats servis à partir de ce lot n'ont aucun coût réel.
 *
 * ⭐ AUCUNE FERMETURE AUTOMATIQUE (arbitrage du 06/08/2026). Un lot reste actif
 * jusqu'à décision humaine — une sauce se conserve trois jours, et clôturer à
 * la journée compterait en perte ce qui est encore en cuisine.
 *
 * ⚠️ Extrait de `ProductionPage` le 08/08/2026, quand Production est devenue un
 * onglet de « Plats ». Composant PRÉSENTATIONNEL : il ne charge rien et ne
 * décide rien. Les données et les mutations viennent du parent, qui les partage
 * avec l'onglet Menu — c'est tout l'intérêt de la fusion.
 */

import { CookingPot, Clock, AlertTriangle, Check, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../ui/Button';
import { EmptyState } from '../common/EmptyState';
import { Modal } from '../ui/Modal';
import { BatchLossForm } from './BatchLossForm';
import { useCurrencyFormatter } from '../../hooks/useBeninCurrency';
import { cn } from '../../lib/utils';
import type { BatchWithDish, BatchCloseStatus } from '../../services/supabase/batches.service';

interface Props {
  batches: BatchWithDish[];
  isLoading: boolean;
  /** §8 — le cuisinier voit ses portions, pas la valeur de son lot. */
  canViewCosts: boolean;
  /**
   * ⚠️ `BatchCloseStatus` et non une union écrite à la main : elle dérive de
   * `BatchStatus` et suivra l'ajout d'un statut de clôture sans divergence.
   */
  onCloseBatch: (batchId: string, status: BatchCloseStatus) => void;
  isClosing: boolean;
  /**
   * ⭐ Perte PARTIELLE - le lot reste en service (09/08/2026).
   * ⚠️ `reason` est ici un TEXTE libre côté serveur : un lot qui continue n'a
   * pas de statut de clôture où loger la cause.
   */
  onRecordLoss: (batchId: string, qty: number, reason: string) => void;
  isRecordingLoss: boolean;
}

/** Âge d'un lot en heures — sert à signaler ce qui traîne. */
function hoursSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}

export function ProductionTab({
  batches,
  isLoading,
  canViewCosts,
  onCloseBatch,
  isClosing,
  onRecordLoss,
  isRecordingLoss,
}: Props) {
  const { formatPrice } = useCurrencyFormatter();

  /**
   * ⭐ Le lot dont on déclare une perte. Remplace l'ancienne confirmation
   * binaire « jeter tout le reste ? » : un formulaire demande COMBIEN et
   * POURQUOI (09/08/2026).
   *
   * ⚠️ La confirmation reste implicite mais entière : le formulaire annonce la
   * conséquence avant le bouton, et une perte est irréversible.
   */
  const [batchInLoss, setBatchInLoss] = useState<BatchWithDish | null>(null);

  if (isLoading) {
    return (
      <p className="py-10 text-center text-caption text-muted-foreground">
        Chargement des lots…
      </p>
    );
  }

  if (batches.length === 0) {
    return (
      <EmptyState
        /* ⚠️ Même icône que l'onglet : un état vide qui n'a pas le symbole de
           l'onglet qu'on vient d'ouvrir se lit comme un autre écran. */
        icon={CookingPot}
        message="Aucun lot en cours"
        subMessage="Les plats préparés d’avance apparaîtront ici avec leurs portions restantes."
      />
    );
  }

  return (
    <>
      <div className="space-y-3">
        {batches.map((batch) => {
          const age = hoursSince(batch.produced_at);
          // ⚠️ Un lot de plus de 12 h mérite un regard : ce n'est pas une
          // péremption (on ne la connaît pas toujours), c'est un signal.
          const isOld = age >= 12;
          const isExpiring =
            batch.expires_at != null &&
            new Date(batch.expires_at).getTime() - Date.now() < 3_600_000 * 6;

          const consumed = batch.produced_qty - batch.remaining_qty;
          const pct =
            batch.produced_qty > 0
              ? Math.round((batch.remaining_qty / batch.produced_qty) * 100)
              : 0;

          return (
            <div
              key={batch.id}
              className={cn(
                'rounded-2xl border bg-card p-4 shadow-sm',
                isExpiring
                  ? 'border-red-200 dark:border-red-900/40'
                  : isOld
                    ? 'border-amber-200 dark:border-amber-900/40'
                    : 'border-border'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-body font-medium text-foreground">
                    {batch.dish_name}
                  </h3>
                  <p className="mt-0.5 flex items-center gap-1 text-caption text-muted-foreground">
                    <Clock size={12} />
                    {age < 1 ? 'il y a moins d’une heure' : `il y a ${Math.floor(age)} h`}
                    {consumed > 0 && ` · ${consumed} servie${consumed > 1 ? 's' : ''}`}
                    {/* ⭐ §19.3 — l'origine est VISIBLE : deux lots du même
                        plat peuvent avoir des coûts très différents selon
                        qu'ils ont été cuisinés ou achetés. Sans cette
                        mention, un écart de prix serait inexplicable. */}
                    {batch.source === 'purchased' && ' · acheté'}
                  </p>
                </div>

                <div className="flex-shrink-0 text-right">
                  <p className="text-h3 font-semibold tabular-nums text-foreground">
                    {batch.remaining_qty}
                    <span className="text-caption font-normal text-muted-foreground">
                      {' '}
                      / {batch.produced_qty}
                    </span>
                  </p>
                  {/* ⭐ Montant réservé à qui a le droit de le voir (§8). */}
                  {canViewCosts && (
                    <p className="text-caption tabular-nums text-muted-foreground">
                      {formatPrice(batch.unit_cost)} / portion
                    </p>
                  )}
                </div>
              </div>

              {/* Jauge de reliquat — lecture immédiate de ce qu'il reste. */}
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    pct <= 20 ? 'bg-red-500' : pct <= 50 ? 'bg-amber-500' : 'bg-green-600'
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>

              {isExpiring && (
                <p className="mt-2 flex items-center gap-1 text-caption text-red-600 dark:text-red-400">
                  <AlertTriangle size={12} />
                  À consommer rapidement
                </p>
              )}

              {batch.notes && (
                <p className="mt-2 text-caption text-muted-foreground">{batch.notes}</p>
              )}

              {/* Actions de clôture — le lot ne se ferme JAMAIS tout seul. */}
              <div className="mt-3 flex gap-2 border-t border-border pt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onCloseBatch(batch.id, 'closed')}
                  disabled={isClosing}
                  className="flex-1"
                >
                  <Check size={14} className="mr-1.5" />
                  Terminer
                </Button>
                {/* ⚠️ Passe par un FORMULAIRE : c'est une perte comptable
                    irréversible, et la quantité perdue n'est pas toujours le
                    reste entier (09/08/2026). */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setBatchInLoss(batch)}
                  disabled={isClosing}
                  className="flex-1 text-red-600 hover:text-red-700 dark:text-red-400"
                >
                  <Trash2 size={14} className="mr-1.5" />
                  Déclarer une perte
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ⭐ COMBIEN et POURQUOI, au lieu d'un simple oui/non.
          ⚠️ Le formulaire porte lui-même l'avertissement : il annonce la
          conséquence (« le lot continue avec 10 ») avant le bouton. */}
      <Modal
        open={batchInLoss !== null}
        onClose={() => setBatchInLoss(null)}
        title="Déclarer une perte"
        description="La matière est déjà sortie du stock : elle ne revient pas."
      >
        {batchInLoss && (
          <BatchLossForm
            dishName={batchInLoss.dish_name}
            remainingQty={batchInLoss.remaining_qty}
            isSubmitting={isClosing || isRecordingLoss}
            onCancel={() => setBatchInLoss(null)}
            onSubmit={({ qty, reason }) => {
              /**
               * ⭐⭐ DEUX CHEMINS SELON L'AMPLEUR, et ce n'est pas cosmétique :
               *   · perte TOTALE → `close_batch` avec le statut réel
               *     (`expired` ou `discarded`) : le lot est clos, et la CAUSE
               *     est enregistrée dans son statut ;
               *   · perte PARTIELLE → `record_batch_loss` : le lot RESTE actif,
               *     donc aucun statut de clôture ne peut porter la cause. Elle
               *     va dans `discard_reason`.
               *
               * ⚠️ Passer par `record_batch_loss` pour une perte totale
               * laisserait le lot en `depleted` — « épuisé », comme s'il avait
               * été servi. La perte serait comptée, mais la cause perdue.
               */
              if (qty >= batchInLoss.remaining_qty) {
                onCloseBatch(batchInLoss.id, reason);
              } else {
                onRecordLoss(batchInLoss.id, qty, reason);
              }
              setBatchInLoss(null);
            }}
          />
        )}
      </Modal>
    </>
  );
}

ProductionTab.displayName = 'ProductionTab';
