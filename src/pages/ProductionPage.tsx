/**
 * ProductionPage
 * Les lots de production — §16.8, phase 3B.1.
 *
 * ⭐⭐ CE QUE CET ÉCRAN APPORTE
 * Le cuisinier braise 20 poulets le matin. Sans cet écran, cette production
 * n'existe nulle part : la matière sort du stock sans qu'on sache ce qu'elle
 * est devenue, et les plats servis à partir de ce lot n'ont aucun coût réel.
 *
 * ⭐ AUCUNE FERMETURE AUTOMATIQUE (arbitrage du 06/08/2026). Un lot reste
 * actif jusqu'à décision humaine — une sauce se conserve trois jours, et
 * clôturer à la journée compterait en perte ce qui est encore en cuisine.
 *
 * ⚠️ §3 — page atteignable UNIQUEMENT si `hasRestaurant`. La route est gardée,
 * et les queries portent leur propre garde : même montée par erreur, aucune
 * requête ne partirait.
 */

import { useMemo, useState } from 'react';
import { Boxes, Plus, Clock, AlertTriangle } from 'lucide-react';
import { SimplePageHeader } from '../components/common/PageHeader';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/common/EmptyState';
import {
  ProduceBatchForm,
  type ProduceBatchValues,
} from '../components/kitchen/ProduceBatchForm';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { useActiveBatches } from '../hooks/queries/useBatchQueries';
import { useBatchMutations } from '../hooks/mutations/useBatchMutations';
import { useDishes } from '../hooks/queries/useDishesQueries';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { cn } from '../lib/utils';

/** Âge d'un lot en heures — sert à signaler ce qui traîne. */
function hoursSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}

export default function ProductionPage() {
  const { currentBar } = useBarContext();
  const { hasPermission } = useAuth();
  const { formatPrice } = useCurrencyFormatter();
  const barId = currentBar?.id;

  const [showForm, setShowForm] = useState(false);

  const { data: batches = [], isLoading } = useActiveBatches(barId);
  const { data: dishes = [] } = useDishes(barId);
  const { produceBatch } = useBatchMutations();

  /**
   * ⚠️ Seuls les plats-BASES peuvent produire un lot. Le spaghetti-poulet
   * prélève dans le lot d'un autre plat — il n'en produit aucun.
   */
  const baseDishes = useMemo(
    () => dishes.filter((d) => d.is_batch_base && d.is_active),
    [dishes]
  );

  /**
   * ⭐ Le COÛT est un montant : réservé à qui peut voir les montants (§8).
   * Le cuisinier voit ses portions, pas la valeur de son lot.
   */
  const canViewCosts = hasPermission('canViewKitchenCosts');

  const handleProduce = (values: ProduceBatchValues) => {
    produceBatch.mutate(
      {
        dishId: values.dishId,
        producedQty: values.producedQty,
        expiresAt: values.expiresAt,
        notes: values.notes,
      },
      { onSuccess: () => setShowForm(false) }
    );
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-24 pt-4">
      <SimplePageHeader
        title="Production"
        subtitle="Lots préparés d’avance"
        icon={<Boxes className="h-5 w-5" />}
        actions={
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus size={16} className="mr-1" />
            Produire
          </Button>
        }
      />

      {isLoading && (
        <p className="py-10 text-center text-caption text-muted-foreground">
          Chargement des lots…
        </p>
      )}

      {!isLoading && batches.length === 0 && (
        <EmptyState
          icon={Boxes}
          message="Aucun lot en cours"
          subMessage="Les plats préparés d’avance apparaîtront ici avec leurs portions restantes."
        />
      )}

      {!isLoading && batches.length > 0 && (
        <div className="mt-4 space-y-3">
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
                      {age < 1
                        ? 'il y a moins d’une heure'
                        : `il y a ${Math.floor(age)} h`}
                      {consumed > 0 && ` · ${consumed} servie${consumed > 1 ? 's' : ''}`}
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
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title="Produire un lot"
        description="Les ingrédients seront sortis du stock."
      >
        <ProduceBatchForm
          baseDishes={baseDishes}
          onSubmit={handleProduce}
          onCancel={() => setShowForm(false)}
          isSubmitting={produceBatch.isPending}
        />
      </Modal>
    </div>
  );
}

ProductionPage.displayName = 'ProductionPage';
