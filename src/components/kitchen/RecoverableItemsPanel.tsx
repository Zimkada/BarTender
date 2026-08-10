/**
 * RecoverableItemsPanel — §19.4
 *
 * ⭐⭐ POURQUOI CET ÉCRAN EXISTE PLUTÔT QU'UNE CASE DANS LA MODALE
 * D'ANNULATION (arbitrage du 10/08/2026, après contre-expertise).
 *
 * Demander « ce plat est-il récupérable ? » au moment d'annuler exige une
 * décision PRÉDICTIVE : personne ne sait encore si une table le prendra, on
 * le saura dans quelques minutes. Et l'écran affiche « perte de 2 000 F » en
 * rouge quand on refuse, rien quand on accepte — c'est une incitation à
 * cocher par optimisme, qui transformerait une perte VISIBLE en lot fantôme
 * que plus personne ne regarde.
 *
 * ⛔ Un « annuler + récupérer » en un clic effacerait aussi le seul signal
 * d'alerte existant : aujourd'hui, annuler un plat prêt laisse une perte
 * anormale dans le journal, qui interroge. Ici la récupération est un acte de
 * gestion délibéré, tracé, dans un écran auditable.
 *
 * ⚠️ AUCUNE BORNE TEMPORELLE — choix métier explicite du 10/08/2026 : un plat
 * préparé le matin, bien conditionné, se sert légitimement en fin de journée.
 * Les LOTS de production n'expirent pas non plus tout seuls (`expires_at` est
 * informatif, « la fermeture est toujours humaine »). Cet écran INFORME de
 * l'âge, il ne décide pas à la place du bar.
 */

import { memo, useMemo } from 'react';
import { RotateCcw, AlertTriangle, Sunrise } from 'lucide-react';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';
import { getCurrentBusinessDateString, calculateBusinessDate, dateToYYYYMMDD } from '../../utils/businessDateHelpers';
import type { RecoverableItem } from '../../services/supabase/kitchen.service';

interface Props {
  items: RecoverableItem[];
  closingHour: number;
  onRecover: (item: RecoverableItem) => void;
  isPending: boolean;
  /** ⚠️ Le cuisinier ne voit PAS les montants (§8) — recevoir n'est pas montrer. */
  canViewCosts: boolean;
  formatPrice: (v: number) => string;
}

/** Libellés alignés sur `KitchenLossesPanel` — un motif ne doit pas se lire différemment d'un écran à l'autre. */
const REASON_LABEL: Record<string, string> = {
  ingredient_shortage: 'Rupture',
  kitchen_overloaded: 'Cuisine surchargée',
  dish_unavailable: 'Plat indisponible',
  server_input_error: 'Erreur de saisie',
  customer_cancelled: 'Client parti',
  substitution_offered: 'Remplacé',
};

/** « il y a 2 h », « il y a 25 min » — l'âge est l'information qui sert à juger. */
function formatAge(iso: string | null): string {
  if (!iso) return 'date inconnue';
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'hier' : `il y a ${days} jours`;
}

export const RecoverableItemsPanel = memo(function RecoverableItemsPanel({
  items, closingHour, onRecover, isPending, canViewCosts, formatPrice,
}: Props) {
  /**
   * ⭐ LE MARQUEUR DEMANDÉ : journée commerciale, pas date civile.
   *
   * `kitchen_order_items` ne porte PAS de `business_date` — on la dérive de
   * `cancelled_at` avec le `closingHour` du bar, exactement comme le SQL.
   * Un plat annulé à 2h du matin appartient au service de la VEILLE : le
   * comparer à la date civile le marquerait « journée précédente » alors que
   * le service est encore en cours, et le gérant cesserait de croire le
   * signal.
   */
  const today = useMemo(
    () => getCurrentBusinessDateString(closingHour),
    [closingHour]
  );

  if (items.length === 0) return null;

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <header className="mb-3">
        <h4 className="flex items-center gap-2 text-body font-semibold">
          <RotateCcw size={16} className="text-amber-600" />
          Plats annulés encore en cuisine
        </h4>
        <p className="mt-1 text-caption text-muted-foreground">
          Leur matière est déjà sortie du stock. Remettez-les en vente s'ils
          sont encore bons, sinon laissez-les : ils resteront comptés en perte.
        </p>
      </header>

      <ul className="flex flex-col gap-2">
        {items.map((item) => {
          const itemDay = item.cancelled_at
            ? dateToYYYYMMDD(calculateBusinessDate(new Date(item.cancelled_at), closingHour))
            : today;
          const isPreviousDay = itemDay < today;
          const isOnOrder = item.production_mode === 'on_order';

          return (
            <li
              key={item.id}
              className={cn(
                'flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3',
                isPreviousDay
                  ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950'
                  : 'border-border'
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-medium">
                  {item.quantity} × {item.dish_name}
                </p>

                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-caption text-muted-foreground">
                  <span>{formatAge(item.cancelled_at)}</span>
                  {item.cancel_reason && (
                    <span>· {REASON_LABEL[item.cancel_reason] ?? item.cancel_reason}</span>
                  )}
                  {canViewCosts && item.computed_cost != null && (
                    <span>· {formatPrice(item.computed_cost)}</span>
                  )}
                </p>

                {/* ⭐ LE MARQUEUR : une journée commerciale antérieure. Il
                    INFORME, il ne bloque pas — c'est au bar de juger de l'état
                    du plat, pas à une minuterie. */}
                {isPreviousDay && (
                  <p className="mt-1 flex items-center gap-1 text-caption font-medium text-amber-800 dark:text-amber-200">
                    <Sunrise size={12} />
                    Journée précédente — vérifiez son état avant de le remettre
                  </p>
                )}

                {/* ⚠️ AVERTISSEMENT `on_order` : le prélèvement ne regarde les
                    lots que pour `batch` et `batch_finish`. Sans ce message, un
                    clic fabriquerait un lot que RIEN ne consommera — un déchet
                    comptable silencieux. */}
                {isOnOrder && (
                  <p className="mt-1 flex items-center gap-1 text-caption text-muted-foreground">
                    <AlertTriangle size={12} />
                    Plat à la commande : le remettre en vente ne le proposera pas
                    automatiquement, il faudra le servir à la main
                  </p>
                )}
              </div>

              <Button
                size="sm"
                variant="outline"
                onClick={() => onRecover(item)}
                disabled={isPending}
              >
                <RotateCcw className="mr-1 h-4 w-4" />
                Remettre en vente
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
});

RecoverableItemsPanel.displayName = 'RecoverableItemsPanel';
