/**
 * KitchenServicePage
 * Écran Service — la file de production en trois colonnes (§9).
 *
 * ⭐⭐ L'ÉCRAN LE PLUS EXIGEANT DU MODULE
 * Il est consulté debout, les mains occupées, dans le bruit. Chaque geste doit
 * être atteignable sans réflexion : d'où des colonnes fixes, des boutons larges
 * et AUCUNE confirmation sur les transitions avant `ready` (le §9 réserve la
 * modale à l'annulation, la seule action non réversible).
 *
 * ⭐ TROIS COLONNES, DEUX MÉTIERS (§6.1)
 * Le cuisinier fait avancer « À faire » → « En cours » → « Prêt ».
 * Le serveur retire depuis « Prêt » — et c'est LUI qui crée la vente.
 * Les permissions étant disjointes, chacun ne voit que ses boutons.
 */

import { useState, useCallback } from 'react';
import { ChefHat, RefreshCw, UtensilsCrossed } from 'lucide-react';
import { SimplePageHeader } from '../components/common/PageHeader';
import { EmptyState } from '../components/common/EmptyState';
import { Button } from '../components/ui/Button';
import { KitchenItemCard } from '../components/kitchen/KitchenItemCard';
import { CancelItemModal } from '../components/kitchen/CancelItemModal';
import { KitchenProductionPanel } from '../components/kitchen/KitchenProductionPanel';
import { BatchAlertBanner } from '../components/kitchen/BatchAlertBanner';
import { useUnifiedKitchenQueue, type KitchenGroup } from '../hooks/pivots/useUnifiedKitchenQueue';
import { useKitchenMutations } from '../hooks/mutations/useKitchenMutations';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../components/Notifications';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { getErrorMessage } from '../utils/errorHandler';
import { cn } from '../lib/utils';
import type {
  KitchenCancelReason,
  KitchenQueueItem,
} from '../services/supabase/kitchen.service';

/** En-tête d'un groupe : « Table 7 » ou « À emporter ». */
function groupLabel(group: KitchenGroup): string {
  if (group.isTakeaway) return 'À emporter';
  if (group.tableNumber !== null) return `Table ${group.tableNumber}`;
  // ⚠️ `table_number` est NULLABLE : sans ce cas, l'en-tête afficherait
  // « Table null » — un défaut visible par tout le service.
  return group.customerName ?? 'Sur place';
}

interface ColumnProps {
  title: string;
  count: number;
  groups: KitchenGroup[];
  emptyLabel: string;
  accent: string;
  renderItem: (item: KitchenQueueItem) => React.ReactNode;
}

function ServiceColumn({ title, count, groups, emptyLabel, accent, renderItem }: ColumnProps) {
  return (
    <section className="flex min-w-0 flex-1 flex-col rounded-xl bg-gray-50 p-3 dark:bg-gray-900">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
        {/* ⭐ Compte les ASSIETTES, pas les tables : c'est ce que le cuisinier
            doit sortir. « 3 tables » ne dit rien du volume de travail. */}
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums text-white',
            accent
          )}
        >
          {count}
        </span>
      </header>

      {groups.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">{emptyLabel}</p>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.key}>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                {groupLabel(group)}
              </p>
              <div className="space-y-2">{group.items.map(renderItem)}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function KitchenServicePage() {
  const { currentBar } = useBarContext();
  const { hasPermission, currentSession } = useAuth();
  const { showNotification } = useNotifications();
  const { formatPrice } = useCurrencyFormatter();

  const { columns, counts, isLoading, refetch } = useUnifiedKitchenQueue(currentBar?.id);
  const { acceptItem, markReady, serveItem, cancelItem } = useKitchenMutations();

  const [itemToCancel, setItemToCancel] = useState<KitchenQueueItem | null>(null);

  const canProduce = hasPermission('canUpdateKitchenOrderStatus');
  const canServe = hasPermission('canServeKitchenItem');
  const canCancel = hasPermission('canCancelKitchenOrderItem');

  /**
   * ⭐⭐ BORNE TEMPORELLE du §6.1 — signalée en test terrain le 04/08/2026.
   *
   * Après `ready` la matière est SORTIE et ne reviendra pas : annuler devient
   * une décision sanitaire ou commerciale, pas opérationnelle. Le RPC
   * `cancel_kitchen_item` ne l'autorise qu'aux rôles de gestion.
   *
   * ⚠️ Ce n'est PAS exprimable par une permission — le §6.1 le dit :
   * `canCancelKitchenOrderItem` « n'est que le premier filtre ». Le cuisinier
   * la possède et peut annuler ce qui n'est pas encore prêt.
   *
   * ⚠️ LISTE BLANCHE, en miroir exact du RPC : un rôle ajouté plus tard est
   * refusé par défaut des deux côtés. Une liste noire ici et blanche là-bas
   * finirait par diverger — le défaut corrigé trois fois sur ce chantier.
   */
  const role = currentSession?.role;
  const canCancelAfterReady =
    role === 'super_admin' || role === 'promoteur' || role === 'gerant';

  const isPending =
    acceptItem.isPending || markReady.isPending || serveItem.isPending || cancelItem.isPending;

  /**
   * ⭐ Handlers STABILISÉS par `useCallback` — condition de la mémoïsation de
   * `KitchenItemCard`. Sans cela, chaque rendu du parent recréerait les
   * fonctions, le `memo()` de la carte comparerait des références différentes
   * et TOUTES les cartes se re-rendraient à chaque tick. Sur une file de
   * 30 plats, c'est l'écran qui rame pendant le coup de feu.
   *
   * ⚠️ VÉRIFIÉ : les objets de mutation React Query sont stables, mais
   * `showNotification` NE l'est PAS (recréé à chaque rendu de son provider).
   * La mémoïsation tient quand même : ce provider ne se re-rend qu'à
   * l'affichage d'une notification, pas pendant le service. Le mémoïser à la
   * source serait le vrai correctif — hors périmètre de ce chantier.
   */
  const handleAccept = useCallback(
    (itemId: string) => {
      acceptItem.mutate(itemId, {
        onError: (error) => showNotification('error', getErrorMessage(error)),
      });
    },
    [acceptItem, showNotification]
  );

  /**
   * ⭐⭐ C'est ICI que la matière sort du stock (§6).
   * ⚠️ Si le stock est insuffisant, le RPC REFUSE — et le message doit le dire
   * clairement : le cuisinier doit savoir qu'il manque un ingrédient, pas
   * qu'« une erreur est survenue ».
   */
  const handleMarkReady = useCallback(
    (itemId: string) => {
      markReady.mutate(
        { itemId },
        {
          onError: (error) => showNotification('error', getErrorMessage(error)),
        }
      );
    },
    [markReady, showNotification]
  );

  const handleServe = useCallback(
    (itemId: string) => {
      serveItem.mutate(
        { itemId },
        {
          onSuccess: () => showNotification('success', 'Plat servi'),
          onError: (error) => showNotification('error', getErrorMessage(error)),
        }
      );
    },
    [serveItem, showNotification]
  );

  const handleCancel = (reason: KitchenCancelReason, note?: string) => {
    if (!itemToCancel) return;

    cancelItem.mutate(
      { itemId: itemToCancel.id, reason, note },
      {
        onSuccess: (result) => {
          // ⭐ La perte est annoncée AU MOMENT où elle se produit. Après coup,
          // elle se dilue dans un écart d'inventaire que personne n'attribue.
          if (result.was_loss) {
            showNotification(
              'info',
              `Plat annulé — perte de ${formatPrice(result.lost_cost ?? 0)} (ingrédients déjà utilisés)`
            );
          } else {
            showNotification('success', 'Plat annulé');
          }
          setItemToCancel(null);
        },
        onError: (error) => showNotification('error', getErrorMessage(error)),
      }
    );
  };

  /**
   * ⚠️ Dépendances COMPLÈTES, sans dérogation ESLint. Une liste tronquée
   * figerait les handlers dans une closure périmée : les boutons appelleraient
   * une mutation d'un rendu précédent — un bug invisible au test et
   * indéboguable en salle.
   */
  const renderItem = useCallback(
    (item: KitchenQueueItem) => (
      <KitchenItemCard
        key={item.id}
        item={item}
        canProduce={canProduce}
        canServe={canServe}
        canCancel={canCancel}
        canCancelAfterReady={canCancelAfterReady}
        onAccept={handleAccept}
        onMarkReady={handleMarkReady}
        onServe={handleServe}
        onCancel={setItemToCancel}
        isPending={isPending}
      />
    ),
    [
      canProduce,
      canServe,
      canCancel,
      canCancelAfterReady,
      handleAccept,
      handleMarkReady,
      handleServe,
      isPending,
    ]
  );

  const totalItems = counts.todo + counts.doing + counts.done;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-4">
      <SimplePageHeader
        title="Service"
        subtitle="File de production de la cuisine"
        icon={<ChefHat className="h-5 w-5" />}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
            aria-label="Rafraîchir la file"
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </Button>
        }
      />

      {/* ⭐⭐ EN TÊTE, AVANT LA FILE — et HORS du bloc conditionnel ci-dessous.
          Une rupture de lot doit se voir même quand la file est vide : c'est
          justement le moment où le cuisinier a le temps de produire.
          ⚠️ Le composant se masque lui-même s'il n'y a rien à signaler. */}
      <BatchAlertBanner barId={currentBar?.id} />

      {!isLoading && totalItems === 0 ? (
        <EmptyState
          icon={UtensilsCrossed}
          message="Aucun plat en cours"
          subMessage="Les commandes envoyées en cuisine apparaîtront ici."
        />
      ) : (
        /* ⚠️ Colonnes empilées sur mobile : trois colonnes sur un téléphone
           rendraient chaque carte illisible. Le cuisinier est sur tablette, le
           serveur sur téléphone — les deux doivent tenir. */
        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-start">
          <ServiceColumn
            title="À faire"
            count={counts.todo}
            groups={columns.todo}
            emptyLabel="Rien en attente"
            accent="bg-gray-500"
            renderItem={renderItem}
          />
          <ServiceColumn
            title="En cours"
            count={counts.doing}
            groups={columns.doing}
            emptyLabel="Aucune préparation"
            accent="bg-amber-500"
            renderItem={renderItem}
          />
          <ServiceColumn
            title="Prêt"
            count={counts.done}
            groups={columns.done}
            emptyLabel="Rien à servir"
            accent="bg-green-600"
            renderItem={renderItem}
          />
        </div>
      )}

      {/* ⭐⭐ HORS du bloc conditionnel ci-dessus, VOLONTAIREMENT.
          Placé dans la branche « file non vide », ce panneau disparaîtrait
          exactement quand la file se vide — c'est-à-dire EN FIN DE SERVICE,
          le moment précis où le cuisinier veut son bilan. */}
      <KitchenProductionPanel barId={currentBar?.id} />

      <CancelItemModal
        item={itemToCancel}
        onClose={() => setItemToCancel(null)}
        onConfirm={handleCancel}
        isPending={cancelItem.isPending}
      />
    </div>
  );
}

KitchenServicePage.displayName = 'KitchenServicePage';
