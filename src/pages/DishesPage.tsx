/**
 * DishesPage
 * Page « Plats » du groupe Cuisine — le MENU et sa PRODUCTION (§16.8).
 *
 * ⭐⭐ POURQUOI CES DEUX ONGLETS ENSEMBLE (arbitrage du 08/08/2026)
 * `ProductionPage` était une entrée de menu distincte. Elle chargeait pourtant
 * déjà `useDishes` — la même liste que cet écran — et la filtrait sur
 * `is_batch_base`. Deux pages qui lisent la même donnée sont un seul écran.
 *
 * ⭐ L'ORDRE SUIT LA DÉPENDANCE, PAS LA FRÉQUENCE.
 * C'est en cochant « préparé d'avance » sur une fiche que le plat devient
 * produisible en lot : un plat absent du Menu ne peut pas apparaître en
 * Production. Mettre Production en premier placerait devant un onglet dont le
 * contenu dépend de celui d'après.
 *
 * ⚠️ COÛT ASSUMÉ : le cuisinier, qui vient produire, arrive sur un écran de
 * configuration. Non corrigé par anticipation (ouverture selon le rôle,
 * mémorisation du dernier onglet) — à trancher au terrain si la gêne existe.
 *
 * ⛔ INGRÉDIENTS ET SERVICE RESTENT DEHORS.
 * Ingrédients a déjà 3 onglets : y ajouter ceux-ci en ferait 5, exactement ce
 * que l'arbitrage du 03/08/2026 avait écarté comme intenable sur mobile.
 * Service est le seul écran que le SERVEUR voit, et le seul utilisé en continu
 * pendant le rush — il garde son entrée directe (§9).
 *
 * ⚠️ §3 — page atteignable UNIQUEMENT si `hasRestaurant`. La route est gardée,
 * et chaque query porte sa propre garde : même montée par erreur, aucune
 * requête ne partirait.
 */

import { useMemo, useState } from 'react';
import { UtensilsCrossed, CookingPot, Plus } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { TabbedPageHeader } from '../components/common/PageHeader';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { DishesTab } from '../components/kitchen/DishesTab';
import { ProductionTab } from '../components/kitchen/ProductionTab';
import {
  ProduceBatchForm,
  type ProduceBatchValues,
} from '../components/kitchen/ProduceBatchForm';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { useUnifiedDishes } from '../hooks/pivots/useUnifiedDishes';
import { useDishCategories } from '../hooks/queries/useDishesQueries';
import { useActiveBatches, useRecoverableItems } from '../hooks/queries/useBatchQueries';
import { useKitchenMutations } from '../hooks/mutations/useKitchenMutations';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { RecoverableItemsPanel } from '../components/kitchen/RecoverableItemsPanel';
import { useBatchMutations } from '../hooks/mutations/useBatchMutations';

type TabId = 'menu' | 'production';

export default function DishesPage() {
  const navigate = useNavigate();
  const { currentBar } = useBarContext();
  const { hasPermission } = useAuth();
  const barId = currentBar?.id;

  /**
   * ⭐ L'ONGLET EST ADRESSABLE : `?tab=production` ouvre directement les lots.
   *
   * ⚠️ Indispensable, pas cosmétique. `BatchAlertBanner` renvoie ici depuis
   * l'écran Service quand un lot est épuisé, et l'ancienne route
   * `/kitchen/production` y redirige. Sans ce paramètre, une alerte de rupture
   * atterrirait sur le Menu — le cuisinier chercherait lui-même l'onglet, en
   * plein service.
   *
   * ⚠️ Lu à l'INITIALISATION seulement : ensuite l'état local fait foi. Le
   * resynchroniser à chaque rendu écraserait le clic de l'utilisateur, qui
   * reviendrait sans cesse sur l'onglet de l'URL.
   */
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabId>(() =>
    searchParams.get('tab') === 'production' ? 'production' : 'menu'
  );
  const [showProduceForm, setShowProduceForm] = useState(false);
  /**
   * ⭐ Affiche aussi les plats RETIRÉS de la carte (09/08/2026).
   *
   * ⛔ Sans cette bascule, un plat retiré disparaît de TOUS les écrans et ne
   * peut plus être remis : la RPC accepte `active = true`, mais plus rien ne
   * permet de désigner le plat. Le retrait était annoncé réversible sans
   * l'être - bloquant trouvé en code review.
   */
  const [showRetired, setShowRetired] = useState(false);

  const { dishes, availableIngredients, isLoading } = useUnifiedDishes(barId, showRetired);
  const { data: dishCategoryRows = [] } = useDishCategories(barId);

  /**
   * ⭐ LE GAIN CONCRET DE LA FUSION : `useDishes` n'est plus chargé deux fois.
   * `useUnifiedDishes` l'expose déjà, et les lots s'y appuient pour leurs noms
   * de plats-bases. Une requête de moins à chaque ouverture (§egress).
   */
  const { data: batches = [], isLoading: isLoadingBatches } = useActiveBatches(barId);

  /**
   * ⭐ §19.4 - plats annulés dont la matière est encore engagée.
   *
   * ⚠️ La query porte sa PROPRE garde (`canValidateSales`) : un cuisinier ou
   * un serveur n'émet même pas la requête. Décider qu'un plat reste servable
   * est une décision sanitaire, réservée aux rôles de gestion comme
   * l'annulation d'un plat prêt (§6.1).
   */
  const { data: recoverableItems = [] } = useRecoverableItems(barId);
  const { recoverCancelledDish } = useKitchenMutations();
  const { formatPrice } = useCurrencyFormatter();
  const { produceBatch, closeBatch, recordBatchLoss } = useBatchMutations();

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

  /**
   * ⚠️ Garde CONSERVÉE malgré `canManageRecipes` sur la route.
   *
   * Les deux permissions sont aujourd'hui alignées sur tous les rôles, mais
   * elles portent des intentions différentes : écrire une recette n'est pas
   * consommer du stock. S'appuyer sur leur égalité actuelle rendrait cet écran
   * silencieusement faux le jour où elles divergent.
   */
  const canProduce = hasPermission('canManageIngredientStock');

  /**
   * ⚠️ Normalisation ici et non dans la query : une catégorie de plats est
   * toujours custom (pas de catalogue global de plats), mais le type de la
   * table autorise `custom_name` à être NULL. Le repli garantit qu'aucune
   * option de sélecteur ne s'affiche vide.
   */
  const dishCategories = useMemo(
    () =>
      dishCategoryRows.map((c) => ({
        id: c.id,
        name: c.custom_name || c.name || 'Sans nom',
      })),
    [dishCategoryRows]
  );

  /**
   * ⚠️ `TabItem.icon` attend un TYPE de composant (React.ElementType), pas un
   * élément rendu — le design system l'instancie avec ses propres props.
   *
   * ⭐ Badge sur Production : le nombre de lots en cours se lit sans ouvrir
   * l'onglet. Variante neutre et non `alert` — un lot actif est l'état
   * NORMAL du service, pas un problème à signaler en rouge.
   */
  const tabs = useMemo(
    () => [
      { id: 'menu', label: 'Menu', icon: UtensilsCrossed },
      {
        // ⚠️ `CookingPot` et NON `Boxes` : cette dernière identifie déjà le
        // groupe « Produits et stock » du menu latéral. C'était l'icône de
        // l'ancienne entrée Production - la conserver garde le repère visuel
        // des utilisateurs qui connaissaient le menu d'avant.
        id: 'production',
        label: 'Production',
        icon: CookingPot,
        badge: batches.length > 0 ? batches.length : undefined,
      },
    ],
    [batches.length]
  );

  const handleProduce = (values: ProduceBatchValues) => {
    produceBatch.mutate(
      {
        dishId: values.dishId,
        producedQty: values.producedQty,
        expiresAt: values.expiresAt,
        notes: values.notes,
        source: values.source,
        totalCost: values.totalCost,
      },
      { onSuccess: () => setShowProduceForm(false) }
    );
  };

  return (
    <div className="min-h-screen bg-brand-subtle pb-20">
      <TabbedPageHeader
        title="Plats"
        /* ⭐ §19.8 — la production et les pertes vivent sur cet écran. */
        guideId="kitchen-service"
        subtitle={
          activeTab === 'menu'
            ? `${dishes.length} plat${dishes.length > 1 ? 's' : ''} au menu`
            : 'Lots préparés d’avance'
        }
        icon={<UtensilsCrossed size={22} />}
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as TabId)}
        onBack={() => navigate('/')}
        /* ⭐ Action CONTEXTUELLE : « Produire » n'a aucun sens sur le Menu.
           ⛔ Doublement conditionnée — onglet ET permission. */
        actions={
          activeTab === 'production' && canProduce ? (
            <Button size="sm" onClick={() => setShowProduceForm(true)}>
              <Plus size={16} className="mr-1" />
              Produire
            </Button>
          ) : undefined
        }
      />

      <div className="px-4 sm:px-6 mt-4">
        {activeTab === 'menu' && (
          <>
            {/* ⭐ ACCÈS AUX PLATS RETIRÉS - discret, sous les onglets : c'est
                une consultation rare, pas un filtre de tous les jours.
                ⚠️ Indispensable pour que le retrait soit RÉVERSIBLE. */}
            <label className="mb-3 flex cursor-pointer items-center gap-2 text-caption text-muted-foreground">
              <input
                type="checkbox"
                checked={showRetired}
                onChange={(e) => setShowRetired(e.target.checked)}
                className="h-4 w-4 accent-brand"
              />
              Afficher aussi les plats retirés du menu
            </label>

            <DishesTab
            barId={barId}
            dishes={dishes}
            ingredients={availableIngredients}
            categories={dishCategories}
            isLoading={isLoading}
            />
          </>
        )}

        {/*
          * ⭐ §19.4 - LA FILE EST MONTÉE ICI, PAS DANS `ProductionTab`, et ce
          * n'est pas un détail de placement : `ProductionTab` retourne un
          * `EmptyState` AVANT son rendu quand `batches` est vide. La file y
          * serait donc invisible dans le cas le plus fréquent - un plat annulé
          * alors qu'aucun lot n'est en cours, ce qui est la situation normale
          * d'un bar qui ne fait que de la cuisine à la commande.
          *
          * ⚠️ Le composant se masque LUI-MÊME quand la liste est vide, et la
          * query porte déjà sa garde de permission (`canValidateSales`) : la
          * condition ici ne porte que sur l'onglet.
          */}
        {activeTab === 'production' && recoverableItems.length > 0 && (
          <div className="mb-3">
            <RecoverableItemsPanel
              items={recoverableItems}
              closingHour={currentBar?.closingHour ?? 6}
              onRecover={(item) =>
                recoverCancelledDish.mutate({ itemId: item.id })
              }
              /* ⭐ L'ID en cours, pas un booléen global : sinon un seul clic
                 figerait toute la liste (cf. RecoverableItemsPanel). */
              pendingItemId={
                recoverCancelledDish.isPending
                  ? recoverCancelledDish.variables?.itemId ?? null
                  : null
              }
              canViewCosts={canViewCosts}
              formatPrice={formatPrice}
            />
          </div>
        )}

        {activeTab === 'production' && (
          <ProductionTab
            batches={batches}
            isLoading={isLoadingBatches}
            canViewCosts={canViewCosts}
            onCloseBatch={(batchId, status) => closeBatch.mutate({ batchId, status })}
            isClosing={closeBatch.isPending}
            /* ⭐ Perte PARTIELLE - le lot reste en service (09/08/2026). */
            onRecordLoss={(batchId, qty, reason) =>
              recordBatchLoss.mutate({ batchId, qty, reason })
            }
            isRecordingLoss={recordBatchLoss.isPending}
          />
        )}
      </div>

      {/* ⚠️ Monté hors des onglets : fermer la modale ne doit pas dépendre de
          l'onglet actif. Rendu seulement si la permission existe — un serveur
          n'atteint pas cette page, mais la modale ne doit pas vivre dans le DOM
          d'un rôle qui ne peut pas produire. */}
      {canProduce && (
        <Modal
          open={showProduceForm}
          onClose={() => setShowProduceForm(false)}
          title="Produire un lot"
          description="Les ingrédients seront sortis du stock."
        >
          <ProduceBatchForm
            baseDishes={baseDishes}
            onSubmit={handleProduce}
            onCancel={() => setShowProduceForm(false)}
            isSubmitting={produceBatch.isPending}
          />
        </Modal>
      )}
    </div>
  );
}

DishesPage.displayName = 'DishesPage';
