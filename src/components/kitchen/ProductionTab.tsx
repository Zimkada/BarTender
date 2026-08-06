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
import { ConfirmationModal } from '../common/ConfirmationModal';
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
}: Props) {
  const { formatPrice } = useCurrencyFormatter();

  /**
   * ⚠️ Le rejet demande CONFIRMATION, pas la clôture simple.
   * Jeter un reste est une PERTE comptable irréversible ; déclarer un lot
   * terminé ne coûte rien. Confirmer les deux banaliserait le geste qui compte.
   */
  const [batchToDiscard, setBatchToDiscard] = useState<string | null>(null);

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
                {/* ⚠️ Jeter passe par une CONFIRMATION : c'est une perte
                    comptable irréversible, contrairement à « Terminer ». */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setBatchToDiscard(batch.id)}
                  disabled={isClosing}
                  className="flex-1 text-red-600 hover:text-red-700 dark:text-red-400"
                >
                  <Trash2 size={14} className="mr-1.5" />
                  Jeter le reste
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ⚠️ Le message annonce CE QUI SERA PERDU, en portions et - pour qui a
          le droit de le voir - en montant. Une confirmation qui ne dit pas ce
          qu'on perd ne sert à rien. */}
      <ConfirmationModal
        isOpen={batchToDiscard !== null}
        onClose={() => setBatchToDiscard(null)}
        onConfirm={() => {
          if (batchToDiscard) {
            onCloseBatch(batchToDiscard, 'discarded');
          }
          setBatchToDiscard(null);
        }}
        title="Jeter le reste du lot ?"
        message={(() => {
          const b = batches.find((x) => x.id === batchToDiscard);
          if (!b) return 'Le reste sera compté en perte.';
          const base = `${b.remaining_qty} portion${b.remaining_qty > 1 ? 's' : ''} de ${b.dish_name} seront comptées en perte.`;
          return canViewCosts
            ? `${base} Soit ${formatPrice(b.remaining_qty * b.unit_cost)} de matière.`
            : base;
        })()}
        confirmLabel="Jeter"
        isDestructive
        isLoading={isClosing}
      />
    </>
  );
}

ProductionTab.displayName = 'ProductionTab';
