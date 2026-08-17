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

import { useState, useCallback, useMemo } from 'react';
import { ChefHat, RefreshCw, UtensilsCrossed } from 'lucide-react';
import { SimplePageHeader } from '../components/common/PageHeader';
import { EmptyState } from '../components/common/EmptyState';
import { Button } from '../components/ui/Button';
import { KitchenItemCard } from '../components/kitchen/KitchenItemCard';
import { CancelItemModal } from '../components/kitchen/CancelItemModal';
import { KitchenProductionPanel } from '../components/kitchen/KitchenProductionPanel';
import { BatchAlertBanner } from '../components/kitchen/BatchAlertBanner';
import { StockShortfallBanner } from '../components/kitchen/StockShortfallBanner';
import { useUnifiedKitchenQueue, type KitchenGroup } from '../hooks/pivots/useUnifiedKitchenQueue';
import { useDishes } from '../hooks/queries/useDishesQueries';
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
  const { currentBar, isSimplifiedKitchen } = useBarContext();
  const { hasPermission, currentSession } = useAuth();
  const { showNotification } = useNotifications();
  const { formatPrice } = useCurrencyFormatter();

  // ⭐ `items` = file BRUTE, non regroupée : c'est elle que le mode simplifié
  //    rend en une liste unique, et elle qui donne le statut réel d'un plat
  //    avant d'enchaîner ses transitions (§20 lot 4).
  const { columns, counts, items: allItems, isLoading, refetch } =
    useUnifiedKitchenQueue(currentBar?.id);
  const { acceptItem, forceOnOrder, markReady, serveItem, cancelItem } =
    useKitchenMutations();

  /**
   * ⭐ Index des plats à LOT — sert au seul bouton « À la commande ».
   * ⚠️ `KitchenQueueItem` ne porte pas `production_mode` : l'ajouter à la vue
   * SQL demanderait une migration pour un booléen d'affichage. `useDishes`
   * est déjà en cache sur cet écran (catalogue, 30 min).
   */
  const { data: dishes = [], isLoading: isLoadingDishes } = useDishes(currentBar?.id);
  const batchFinishDishIds = useMemo(
    () => new Set(dishes.filter((d) => d.production_mode === 'batch_finish').map((d) => d.id)),
    [dishes]
  );

  /**
   * ⭐ TANT QUE LES PLATS NE SONT PAS CHARGÉS, on AFFICHE le bouton plutôt que
   * de le masquer — défaut trouvé à la code review du 08/08/2026.
   *
   * ⚠️ Avec un Set vide, `isBatchFinish` valait `false` partout : le cuisinier
   * lisait « préparez ce plat à la commande » dans le refus de lot, cherchait
   * le bouton… et ne le trouvait pas. Court (cache 30 min, donc au premier
   * affichage), mais c'est EXACTEMENT le moment où il en a besoin.
   *
   * ⭐ Le risque inverse est nul : `force_item_on_order` refuse proprement un
   * plat qui ne prélève aucun lot, avec un message clair. Un bouton qui
   * explique pourquoi il ne s'applique pas vaut mieux qu'un bouton absent.
   */
  const isBatchFinishItem = useCallback(
    (dishId: string) => isLoadingDishes || batchFinishDishIds.has(dishId),
    [isLoadingDishes, batchFinishDishIds]
  );

  const [itemToCancel, setItemToCancel] = useState<KitchenQueueItem | null>(null);

  const canProduce = hasPermission('canUpdateKitchenOrderStatus');
  /**
   * ⛔⛔ `serve` CRÉE LA VENTE — et `create_sale_idempotent` REFUSE un serveur
   * en mode simplifié (whitelist_create_sale_roles:216).
   *
   * Le menu masque déjà cette page au serveur dans ce cas (MobileSidebar), mais
   * la ROUTE ne le fait pas : elle garde `canViewKitchenOrders`, que le serveur
   * possède. Une URL directe l'amènerait donc ici avec un bouton « Servir » qui
   * échouerait côté SQL.
   *
   * ⚠️ `canValidateSales` en miroir de `Cart.tsx:301` : gérant et promoteur
   * l'ont, le serveur non. On masque le GESTE, pas l'écran — voir la file
   * reste légitime (§6.1).
   */
  const canServe =
    hasPermission('canServeKitchenItem') &&
    (!isSimplifiedKitchen || hasPermission('canValidateSales'));
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
   *
   * ⛔ CORRECTION du 08/08/2026 : ce commentaire affirmait que « le RPC REFUSE
   * si le stock est insuffisant ». C'est FAUX et l'inverse du §4.4 —
   * `consume_ingredients_fefo` crée une DETTE et retourne `success: true`. Le
   * RPC ne lève que si le FEFO échoue TECHNIQUEMENT.
   * ⭐ C'est pourquoi `StockShortfallBanner` existe : puisque rien ne bloque,
   * il faut prévenir AVANT.
   */
  /**
   * ⭐ La SORTIE quand un lot manque (§16.9). Le message d'erreur du refus
   * l'annonce — ce handler la rend exécutable.
   */
  const handleForceOnOrder = useCallback(
    (itemId: string) => {
      forceOnOrder.mutate(itemId);
    },
    [forceOnOrder]
  );

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

  /**
   * ⭐⭐ §20 LOT 4 — UN SEUL GESTE QUAND LE GÉRANT OPÈRE SEUL.
   *
   * En mode simplifié il n'y a ni cuisinier ni serveur : le gérant prend la
   * commande, cuisine et sert. Lui faire parcourir trois colonnes pour un même
   * plat, c'est lui demander de déclarer séparément trois gestes qu'il a faits
   * d'affilée. « Plat servi » enchaîne les transitions RÉELLES.
   *
   * ⛔ AUCUN RPC NOUVEAU, aucune transition inventée. Ce sont les trois appels
   * du mode complet, dans le même ordre, avec les mêmes écritures — donc le
   * même décrément FEFO et le même coût matière figé. C'est ce qui préserve la
   * fiabilité de la marge (§8) et évite un second chemin métier à tester.
   *
   * ⭐⭐ LE RETRY EST SÛR — les trois RPC sont IDEMPOTENTS (vérifié le
   * 14/08/2026) :
   *   · `accept_kitchen_item`      → refuse hors ('pending','accepted')
   *   · `mark_kitchen_item_ready`  → `consumed_at IS NOT NULL` ⟹ replay
   *   · `serve_kitchen_item`       → `status = 'served'` ⟹ renvoie le sale_id
   * Un plat déjà accepté n'est donc PAS ré-accepté, et surtout la matière
   * n'est JAMAIS consommée deux fois. C'est cette propriété qui autorise un
   * bouton unique là où trois colonnes existaient.
   *
   * ⚠️ LES TROIS APPELS NE SONT PAS ATOMIQUES, et on ne les fusionne pas en un
   * RPC — ce serait le second chemin métier qu'on veut éviter. En cas d'échec
   * partiel, le plat reste dans la liste avec son bouton : réappuyer rejoue la
   * séquence et ne refait QUE l'étape manquante.
   *
   * ⚠️ ON PART DU STATUT RÉEL, jamais de zéro : un plat déjà `preparing` ne
   * repasse pas par `accept`. Inutile de solliciter le réseau pour un appel
   * dont on sait qu'il sera ignoré.
   */
  const handleServeInOneGo = useCallback(
    async (itemId: string) => {
      const item = allItems.find((i) => i.id === itemId);
      if (!item) return;

      /**
       * ⭐ L'ÉTAPE ATTEINTE, suivie au fil de la séquence. C'est elle qui rend
       * le message d'échec exploitable : sans elle, on ne peut dire au gérant
       * que « ça a raté », pas OÙ ni QUOI FAIRE.
       */
      let reached: 'accepted' | 'ready' | null =
        item.status === 'preparing' || item.status === 'accepted'
          ? 'accepted'
          : item.status === 'ready'
            ? 'ready'
            : null;

      try {
        if (item.status === 'pending') {
          await acceptItem.mutateAsync(itemId);
          reached = 'accepted';
        }
        if (item.status === 'pending' || item.status === 'accepted' || item.status === 'preparing') {
          await markReady.mutateAsync({ itemId });
          reached = 'ready';
        }
        await serveItem.mutateAsync({ itemId });
        showNotification('success', 'Plat servi');
      } catch (error) {
        /**
         * ⚠️⚠️ DIRE OÙ EN EST LE PLAT, pas seulement que ça a échoué.
         *
         * ⛔ Défaut trouvé à la revue du 17/08 : ce bloc n'affichait que
         * `getErrorMessage(error)`, alors que le commentaire promettait de
         * nommer l'étape. Un commentaire qui décrit une intention NON
         * implémentée est pire qu'une absence : il rassure le prochain lecteur.
         *
         * Le cas réel : plat `batch_finish` à lot vide. `accept` passe,
         * `mark_ready` échoue sur `BATCH_EMPTY`. Le gérant voyait « lot
         * épuisé » sans savoir que le plat avait avancé, ni que « À la
         * commande » — qui reste affiché sur `accepted` — est sa sortie.
         *
         * ⭐ On NE MASQUE PAS le message du serveur : il porte le motif métier
         * (lot épuisé, dette d'ingrédient). On le PRÉFIXE de l'état atteint.
         */
        const where =
          reached === 'ready'
            ? 'Plat prêt, reste à servir'
            : reached === 'accepted'
              ? 'Plat en préparation, pas encore prêt'
              : 'Plat inchangé';

        showNotification('error', `${where} - ${getErrorMessage(error)}`);
      }
    },
    [allItems, acceptItem, markReady, serveItem, showNotification]
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
              `Plat annulé - perte de ${formatPrice(result.lost_cost ?? 0)} (ingrédients déjà utilisés)`
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
        onForceOnOrder={handleForceOnOrder}
        isBatchFinish={isBatchFinishItem(item.dish_id)}
        onMarkReady={handleMarkReady}
        onServe={handleServe}
        /* ⭐ §20 — passé UNIQUEMENT en cuisine simplifiée. Ailleurs la prop est
           `undefined` et la carte rend ses boutons d'étape, à l'identique. */
        onServeInOneGo={isSimplifiedKitchen ? handleServeInOneGo : undefined}
        onCancel={setItemToCancel}
        isPending={isPending}
      />
    ),
    [
      canProduce,
      canServe,
      canCancel,
      canCancelAfterReady,
      isBatchFinishItem,
      handleForceOnOrder,
      handleAccept,
      handleMarkReady,
      handleServe,
      // ⚠️ §20 — les DEUX, sinon `renderItem` figerait soit le mode, soit un
      //    handler périmé. Le fichier documente déjà ce piège plus haut.
      isSimplifiedKitchen,
      handleServeInOneGo,
      isPending,
    ]
  );

  const totalItems = counts.todo + counts.doing + counts.done;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-4">
      <SimplePageHeader
        title="Service"
        /* ⭐ §19.8 — le serveur y sert, le cuisinier y produit : la visite
           s adapte au role via targetRoles et visibleFor. */
        guideId={currentSession?.role === 'serveur' ? 'kitchen-order' : 'kitchen-service'}
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

      {/* ⭐ Le manque de MATIÈRE, à côté du manque de LOTS (§4.4).
          ⚠️ Deux bandeaux distincts et non fusionnés : un lot épuisé se règle
          en produisant, un ingrédient manquant en approvisionnant. Mêler les
          deux donnerait une alerte sans geste clair. */}
      <StockShortfallBanner barId={currentBar?.id} />

      {!isLoading && totalItems === 0 ? (
        <EmptyState
          icon={UtensilsCrossed}
          message="Aucun plat en cours"
          subMessage="Les commandes envoyées en cuisine apparaîtront ici."
        />
      ) : isSimplifiedKitchen ? (
        /**
         * ⭐⭐ §20 LOT 4 — UNE SEULE LISTE QUAND LE GÉRANT OPÈRE SEUL.
         *
         * Les trois colonnes servent à répartir le travail entre trois acteurs
         * (qui accepte, qui prépare, qui sert). En mode simplifié il n'y en a
         * qu'un : les colonnes ne répartissent plus rien et obligent à
         * chercher un plat dans trois endroits.
         *
         * ⚠️ On garde `ServiceColumn` plutôt qu'un rendu ad hoc : le
         * regroupement par table/destination, l'ordre et le style des cartes
         * restent EXACTEMENT ceux du mode complet. Seul le nombre de colonnes
         * change — donc rien de neuf à tester côté rendu.
         *
         * ⭐ `allGroups` concatène les trois colonnes DANS L'ORDRE du service :
         * à faire, puis en cours, puis prêt. Le plat le plus avancé finit en
         * bas, là où le gérant le cherche pour l'envoyer.
         */
        <div className="mt-4">
          <ServiceColumn
            title="Service"
            count={totalItems}
            groups={[...columns.todo, ...columns.doing, ...columns.done]}
            emptyLabel="Rien en cours"
            accent="bg-brand-primary"
            renderItem={renderItem}
          />
        </div>
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
