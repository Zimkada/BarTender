/**
 * IngredientsPage
 * Écran de suivi du stock cuisine — phase 1 du module restauration.
 *
 * ⭐ CE QUE CET ÉCRAN APPORTE AU PROMOTEUR
 * La cuisine est aujourd'hui une zone de dépense TOTALEMENT invisible : rien ne
 * suit ce qu'elle consomme. Cet écran est le premier à chiffrer deux choses
 * qui n'existent nulle part ailleurs :
 *   - ce qui va être perdu si personne n'agit (§8, 5e métrique) ;
 *   - ce qui a été consommé sans stock disponible (dettes, §13.2).
 *
 * ⚠️ §3 — Cette page n'est atteignable QUE si `hasRestaurant`. La route est
 * gardée dans routes/index.tsx, et les queries portent leur propre garde :
 * même montée par erreur, aucune requête ne partirait.
 */

import { useState, useMemo } from 'react';
import { Package, AlertTriangle, Clock, Plus, TrendingDown, ChefHat, Pencil, Trash2, X, Scale } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { TabbedPageHeader } from '../components/common/PageHeader';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/common/EmptyState';
import { ConfirmationModal } from '../components/common/ConfirmationModal';
import { SupplyForm, type SupplyFormValues } from '../components/kitchen/SupplyForm';
import { IngredientSizesEditor } from '../components/kitchen/IngredientSizesEditor';
import { SizeReconciliationPanel } from '../components/kitchen/SizeReconciliationPanel';
import {
  useSizeReconciliation,
  useAllIngredientSizes,
} from '../hooks/queries/useIngredientsQueries';
import { useDishes } from '../hooks/queries/useDishesQueries';
import { PriceOptionSizeLinker } from '../components/kitchen/PriceOptionSizeLinker';
import { LotCountForm } from '../components/kitchen/LotCountForm';
import { IngredientForm } from '../components/kitchen/IngredientForm';
import { IngredientLossFormLoader } from '../components/kitchen/IngredientLossForm';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { useUnifiedKitchen, type IngredientWithAlerts } from '../hooks/pivots/useUnifiedKitchen';
import { useIngredientMutations } from '../hooks/mutations/useIngredientMutations';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { cn } from '../lib/utils';
import { dateToYYYYMMDD } from '../utils/businessDateHelpers';

/**
 * ⭐ DÉCOUPAGE DU 03/08/2026 — « Plats » est sorti d'ici pour devenir sa propre
 * page (`DishesPage`), première étape du passage de Cuisine en groupe de menu.
 *
 * ⚠️ « Appro » RESTE un onglet et ne devient pas une page : l'approvisionnement
 * EST une opération d'ingrédients, et il était déjà ici sous forme de bouton
 * dans l'en-tête. En faire un onglet formalise ce qui existait.
 * Coût assumé : c'est le SEUL onglet conditionnel par rôle du module — le §9
 * pose que « le cuisinier ne voit jamais l'onglet Appro (il touche à l'argent) ».
 * Un onglet masqué reste acceptable ; c'est toute une PAGE à onglets
 * conditionnels qui devenait ingérable.
 */
type TabId = 'stock' | 'expiring' | 'supply' | 'control';

/**
 * Fenêtre d'alerte de péremption, en jours.
 *
 * ⚠️ Source unique : passée au pivot ET affichée dans les libellés. Écrite en
 * dur aux deux endroits, un changement de fenêtre rendrait l'affichage faux
 * sans qu'aucun test ne le signale — l'écran annoncerait « 3 jours » en
 * listant les lots de 7.
 */
const EXPIRY_WINDOW_DAYS = 3;

/**
 * ⭐ §19.6 — fenêtres du rapprochement.
 *
 * ⚠️ Aucune option « aujourd'hui » : sur une seule journée, un carton reçu la
 * veille et vendu le jour même produit un écart négatif qui n'est qu'un
 * artefact de découpage. Proposer ce choix inviterait à conclure au vol sur
 * un chiffre que le mécanisme ne peut pas garantir.
 */
const CONTROL_WINDOWS = [
  { days: 7, label: '7 jours', periodLabel: 'sur les 7 derniers jours' },
  { days: 30, label: '30 jours', periodLabel: 'sur les 30 derniers jours' },
  { days: 90, label: '3 mois', periodLabel: 'sur les 3 derniers mois' },
] as const;

/**
 * Formate une date SQL (`YYYY-MM-DD`) en date française.
 *
 * ⚠️ Découpage manuel plutôt que `new Date(iso)` : ce dernier interprète une
 * date SEULE comme de l'UTC minuit. Sur un fuseau négatif, « 2026-08-05 »
 * s'afficherait « 04/08/2026 » — la veille. Même piège que la fenêtre de
 * péremption, corrigé côté service.
 */
const formatExpiryDate = (isoDate: string): string => {
  const [year, month, day] = isoDate.split('-');
  if (!year || !month || !day) return isoDate;
  return `${day}/${month}/${year}`;
};

export default function IngredientsPage() {
  const navigate = useNavigate();
  const { currentBar } = useBarContext();
  const { formatPrice } = useCurrencyFormatter();

  /**
   * ⭐ §9 — le cuisinier ne voit pas l'Appro : il « touche à l'argent ».
   * `canViewKitchenCosts` porte cette distinction (quantités oui, montants non).
   */
  const { hasPermission } = useAuth();
  const canViewCosts = hasPermission('canViewKitchenCosts');

  const [activeTab, setActiveTab] = useState<TabId>('stock');
  const [showSupplyModal, setShowSupplyModal] = useState(false);
  /**
   * ⭐ L'ingrédient dont on déclare une perte (09/08/2026).
   *
   * ⚠️ On garde l'INGRÉDIENT et non le lot : le formulaire charge ses lots et
   * laisse l'utilisateur choisir lequel est abîmé - deux lots du même
   * ingrédient ont des coûts différents.
   */
  const [lossFor, setLossFor] = useState<IngredientWithAlerts | null>(null);
  /**
   * ⭐ L'ingrédient qu'on s'apprête à retirer du catalogue (09/08/2026).
   * ⛔ Le serveur REFUSE s'il reste du stock - la confirmation ne remplace pas
   * cette garde, elle évite le clic accidentel.
   */
  const [toRetire, setToRetire] = useState<IngredientWithAlerts | null>(null);
  /**
   * ⭐ Affiche aussi les ingrédients RETIRÉS du catalogue (09/08/2026).
   * ⛔ Sans cette bascule, un ingrédient retiré disparaît de partout et ne
   * peut plus être remis - le retrait était annoncé réversible sans l'être.
   */
  const [showRetired, setShowRetired] = useState(false);
  const [preselectedIngredient, setPreselectedIngredient] = useState<string | undefined>();
  /** Incrémenté après un enregistrement confirmé → nouvelle clé d'idempotence. */
  const [resetSignal, setResetSignal] = useState(0);
  /**
   * ⭐ §19.6 — fenêtre du rapprochement, en jours glissants.
   *
   * ⚠️ 7 jours par DÉFAUT et non 1 : sur une journée, un carton reçu la
   * veille et vendu aujourd'hui produit un écart négatif ALARMANT qui n'est
   * qu'un artefact de découpage. Le défaut doit être la fenêtre où le
   * chiffre est le plus fiable, pas la plus courte.
   */
  const [controlDays, setControlDays] = useState(7);
  /**
   * ⭐ §19.6 — le lot qu'on vient de recevoir et qu'on propose de compter.
   *
   * ⚠️ On garde le `ingredientId` AVEC le lot : le formulaire doit charger les
   * tailles de l'ingrédient, et le lot seul ne les porte pas.
   */
  const [countingLot, setCountingLot] = useState<
    { lotId: string; ingredientId: string } | null
  >(null);
  /** Formulaire d'ingrédient : création, ou édition d'un existant. */
  const [editingIngredient, setEditingIngredient] = useState<
    { mode: 'create' } | { mode: 'edit'; ingredient: IngredientWithAlerts } | null
  >(null);

  const {
    ingredients,
    expiringLots,
    expiringValue,
    lowStockIngredients,
    ingredientsInDebt,
    isLoading,
  } = useUnifiedKitchen(currentBar?.id, EXPIRY_WINDOW_DAYS, showRetired);

  const { receiveSupply, upsertIngredient, recordLotLoss, setIngredientActive } =
    useIngredientMutations();

  /**
   * ⭐ §19.6 — rapprochement reçus ↔ vendus.
   *
   * ⚠️ `enabled` sur l'onglet ACTIF : cet écran est consulté ponctuellement,
   * la requête ne doit pas partir tant qu'il n'est pas ouvert. La query porte
   * en plus ses propres gardes (§3 + `canViewKitchenCosts`).
   */
  const controlRange = useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - controlDays);
    return { start: dateToYYYYMMDD(start), end: dateToYYYYMMDD(end) };
  }, [controlDays]);

  /**
   * ⚠️ Plats et tailles chargés SEULEMENT sur l'onglet Contrôle : ce sont
   * deux requêtes qui n'ont aucune raison de partir depuis l'écran Stock.
   */
  const { data: dishes = [] } = useDishes(
    activeTab === 'control' ? currentBar?.id : undefined
  );
  const { data: allSizes = [] } = useAllIngredientSizes(
    currentBar?.id,
    activeTab === 'control'
  );

  const { data: reconciliation = [], isLoading: isLoadingReconciliation } =
    useSizeReconciliation(
      currentBar?.id,
      controlRange.start,
      controlRange.end,
      activeTab === 'control'
    );

  const openSupply = (ingredientId?: string) => {
    setPreselectedIngredient(ingredientId);
    setShowSupplyModal(true);
  };

  const handleSupply = (values: SupplyFormValues) => {
    receiveSupply.mutate(values, {
      onSuccess: (result) => {
        // ⚠️ Le signal n'est envoyé QU'APRÈS confirmation : renouveler la clé
        // avant la réponse annulerait la protection anti-double-clic.
        setResetSignal((n) => n + 1);
        setShowSupplyModal(false);

        /**
         * ⭐ §19.6 — ENCHAÎNEMENT VERS LE COMPTAGE, si l'ingrédient est trié.
         *
         * Le tri se fait À LA RÉCEPTION, carton ouvert, pas trois heures
         * après : proposer le comptage à ce moment précis est le seul moyen
         * qu'il ait lieu. Un écran différé ne serait jamais ouvert.
         *
         * ⛔⛔ DEUX GARDES, et la première n'est PAS défensive.
         *
         * `lot_id` peut être NULL : quand l'appro n'a fait que SOLDER DES
         * DETTES (on avait consommé sans stock), aucun lot n'est créé. Il n'y
         * a alors rien à compter - ouvrir un écran de comptage sur un carton
         * inexistant serait absurde, et la RPC refuserait.
         *
         * ⚠️ Un REJEU (`idempotent_replay`) retourne un `lot_id` valide mais
         * l'appro a déjà eu lieu : proposer de compter à nouveau ferait
         * REMPLACER un comptage existant par un écran vide.
         */
        if (result.lot_id && !result.idempotent_replay) {
          setCountingLot({ lotId: result.lot_id, ingredientId: values.ingredientId });
        }
      },
      // ⛔ PAS de `onError` qui incrémenterait resetSignal.
      //
      // Sur échec, la modale reste ouverte AVEC LA MÊME CLÉ — c'est voulu :
      // l'utilisateur réessaie la MÊME opération. Si l'échec était en réalité
      // un timeout après un commit réussi côté serveur, le retry serait
      // reconnu comme un rejeu et ne créerait PAS un second lot.
      //
      // Renouveler la clé ici transformerait chaque retry en nouvel appro —
      // exactement le doublon que tout le mécanisme existe pour empêcher.
      // Le toast d'erreur est géré par useIngredientMutations.
    });
  };

  const handleSaveIngredient = (values: Parameters<typeof upsertIngredient.mutate>[0]) => {
    upsertIngredient.mutate(values, {
      onSuccess: () => setEditingIngredient(null),
      // Sur échec, le formulaire RESTE ouvert avec sa saisie : l'utilisateur
      // corrige au lieu de tout retaper. Le toast d'erreur vient de la mutation.
    });
  };

  // ⚠️ `TabItem.icon` attend un TYPE de composant (React.ElementType), pas un
  // élément rendu — le design system l'instancie lui-même avec ses propres props.
  const tabs = useMemo(
    () => [
      { id: 'stock', label: 'Stock', icon: Package },
      {
        id: 'expiring',
        label: 'Péremption',
        icon: Clock,
        // Badge : le nombre attire l'œil là où il y a une action à prendre.
        badge: expiringLots.length > 0 ? expiringLots.length : undefined,
        badgeVariant: 'alert' as const,
      },
      // ⭐ §9 — « Le cuisinier ne voit jamais l'onglet Appro (il touche à
      // l'argent) ». `canViewKitchenCosts` porte exactement cette distinction :
      // le cuisinier voit les QUANTITÉS, pas les MONTANTS (§8).
      // ⚠️ Filtré ICI et non masqué en CSS : un onglet caché resterait
      // atteignable au clavier et présent dans le DOM.
      ...(canViewCosts
        ? [{ id: 'supply', label: 'Appro', icon: Plus }]
        : []),
      /**
       * ⭐ §19.6 — CONTRÔLE : ce qui a été reçu face à ce qui a été vendu,
       * par taille. Le contrôle que le restaurateur fait déjà au cahier.
       *
       * ⛔ MÊME GARDE QUE L'APPRO, et pour une raison plus forte : cet écran
       * sert à repérer un serveur qui facture du grand en servant du moyen.
       * Le montrer à celui qu'il surveille le viderait de son sens.
       * ⚠️ La query porte la MÊME permission — la garde est RÉSEAU, pas
       * seulement visuelle : un onglet masqué en CSS resterait atteignable.
       */
      ...(canViewCosts
        ? [{ id: 'control', label: 'Contrôle', icon: Scale }]
        : []),
    ],
    [expiringLots.length, canViewCosts]
  );

  return (
    <div className="min-h-screen bg-brand-subtle pb-20">
      {/* ⚠️ Titre « Ingrédients » depuis le découpage : « Plats » a sa propre
          page, cet écran ne porte plus que le stock et son appro. */}
      {/* ⭐ PAS de bouton « Appro » dans l'en-tête depuis le découpage.
          Il appelait `openSupply()` SANS ingrédient — exactement ce que fait
          désormais l'onglet Appro, visible juste en dessous, et en mieux :
          formulaire en pleine page plutôt qu'en modale.
          ⚠️ L'appro CIBLÉ (depuis une ligne de stock, avec `ingredient.id`)
          reste indispensable : lui présélectionne l'ingrédient. C'est le seul
          usage restant de la modale. */}
      <TabbedPageHeader
        title="Ingrédients"
        /* ⭐ §19.8 — visite « Monter votre carte » : c'est ici qu'on crée
           les ingrédients et qu'on approvisionne. */
        guideId="kitchen-setup"
        subtitle={`${ingredients.length} ingrédient${ingredients.length > 1 ? 's' : ''}`}
        icon={<ChefHat size={22} />}
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as TabId)}
        onBack={() => navigate('/')}
      />

      <div className="px-4 sm:px-6 space-y-4 mt-4">
        {/* ⭐ Les deux chiffres qui n'existent nulle part ailleurs.
            Affichés AVANT les listes : un montant déclenche l'action,
            une liste demande d'abord d'être lue.
            ⚠️ Masqués sur l'onglet Plats : ces alertes portent sur le STOCK.
            Les y laisser repousserait la liste des plats vers le bas pour une
            information sans rapport avec ce que l'utilisateur regarde. */}
        {activeTab !== 'supply' && (expiringValue > 0 || ingredientsInDebt.length > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {expiringValue > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30 p-4">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 mb-1">
                  <Clock size={16} />
                  <span className="text-caption font-semibold uppercase tracking-wide">
                    À consommer rapidement
                  </span>
                </div>
                <p className="text-h3 font-bold text-amber-900 dark:text-amber-300">
                  {formatPrice(Math.round(expiringValue))}
                </p>
                <p className="text-caption text-amber-700/80 dark:text-amber-400/80">
                  {expiringLots.length} lot{expiringLots.length > 1 ? 's' : ''} périme
                  {expiringLots.length > 1 ? 'nt' : ''} sous {EXPIRY_WINDOW_DAYS} jours
                </p>
              </div>
            )}

            {ingredientsInDebt.length > 0 && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                <div className="flex items-center gap-2 text-destructive mb-1">
                  <TrendingDown size={16} />
                  <span className="text-caption font-semibold uppercase tracking-wide">
                    Stock négatif
                  </span>
                </div>
                <p className="text-h3 font-bold text-destructive">
                  {ingredientsInDebt.length}
                </p>
                {/* ⚠️ « consommé sans stock » et non « rupture » : la matière
                    est DÉJÀ partie, il ne s'agit pas d'un manque à venir. */}
                <p className="text-caption text-destructive/80">
                  ingrédient{ingredientsInDebt.length > 1 ? 's' : ''} consommé
                  {ingredientsInDebt.length > 1 ? 's' : ''} sans stock — à régulariser
                </p>
              </div>
            )}
          </div>
        )}

        {/* ===== Onglet Appro =====
            ⭐ Le formulaire est rendu DIRECTEMENT dans l'onglet, sans modale :
            l'onglet EST l'écran d'approvisionnement. Ouvrir une modale
            par-dessus un onglet dédié serait un empilement inutile.
            ⚠️ La modale reste utilisée pour l'appro CIBLÉ depuis la liste de
            stock (bouton par ingrédient) — deux chemins, un seul formulaire. */}
        {activeTab === 'supply' && canViewCosts && (
          <div className="rounded-xl border border-border bg-card p-4">
            <SupplyForm
              ingredients={ingredients}
              onSubmit={handleSupply}
              // ⚠️ En modale, « Annuler » ferme. Dans un onglet il n'y a rien à
              // fermer : le geste équivalent est de revenir au stock. Laisser
              // un `() => {}` produirait un bouton mort.
              onCancel={() => setActiveTab('stock')}
              isSubmitting={receiveSupply.isPending}
              resetSignal={resetSignal}
            />
          </div>
        )}

        {/* ===== §19.6 — Onglet Contrôle ===== */}
        {activeTab === 'control' && canViewCosts && (
          <div className="rounded-xl border border-border bg-card p-4">
            {/*
              ⚠️ SÉLECTEUR EN JOURS GLISSANTS, pas de dates calendaires.
              Le rapprochement se fait PAR PÉRIODE : un carton reçu la veille
              et vendu le lendemain apparaît dans deux périodes. Élargir la
              fenêtre est le premier réflexe à avoir devant un écart — le
              sélecteur doit donc rendre ce geste immédiat.
            */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-caption text-muted-foreground">Afficher</span>
              {CONTROL_WINDOWS.map((w) => (
                <button
                  key={w.days}
                  type="button"
                  onClick={() => setControlDays(w.days)}
                  className={cn(
                    'rounded-lg border px-3 py-1.5 text-caption transition-colors',
                    controlDays === w.days
                      ? 'border-brand-primary bg-brand-subtle font-medium text-brand-primary'
                      : 'border-border hover:bg-muted'
                  )}
                >
                  {w.label}
                </button>
              ))}
            </div>

            {/*
              ⭐ §19.6 — L'ASSOCIATION AU-DESSUS DU RAPPROCHEMENT, et dans cet
              ordre : c'est elle qui le rend possible. Un gérant qui voit
              « aucun mouvement » trouve juste au-dessus ce qui lui manque.
              ⚠️ Le composant se masque LUI-MÊME sans formats ni tailles.
            */}
            <div className="mb-4">
              <PriceOptionSizeLinker dishes={dishes} sizes={allSizes} />
            </div>

            <SizeReconciliationPanel
              rows={reconciliation}
              isLoading={isLoadingReconciliation}
              periodLabel={
                CONTROL_WINDOWS.find((w) => w.days === controlDays)?.periodLabel ?? ''
              }
            />
          </div>
        )}

        {isLoading && activeTab !== 'supply' && activeTab !== 'control' && (
          <p className="text-center text-muted-foreground py-8">Chargement…</p>
        )}

        {/* ===== Onglet Stock ===== */}
        {!isLoading && activeTab === 'stock' && (
          <>
            {ingredients.length === 0 ? (
              <EmptyState
                icon={Package}
                message="Aucun ingrédient"
                // ⭐ §13.12 — « ingrédients critiques d'abord » : le parcours
                // commence par CRÉER un ingrédient, pas par l'approvisionner.
                // Orienter vers l'appro serait un cul-de-sac : son sélecteur
                // serait vide.
                subMessage="Commencez par vos ingrédients principaux — ceux qui portent le coût de vos plats."
                action={
                  <Button onClick={() => setEditingIngredient({ mode: 'create' })}>
                    <Plus size={16} className="mr-1.5" />
                    Nouvel ingrédient
                  </Button>
                }
              />
            ) : (
              <div className="space-y-2">
                {/* ⭐ Création accessible en permanence, pas seulement depuis
                    l'état vide : on ajoute des ingrédients au fil du temps. */}
                <div className="flex items-center justify-between gap-3">
                  {/* ⭐ ACCÈS AUX INGRÉDIENTS RETIRÉS - indispensable pour que
                      le retrait soit RÉVERSIBLE (09/08/2026). */}
                  <label className="flex cursor-pointer items-center gap-2 text-caption text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={showRetired}
                      onChange={(e) => setShowRetired(e.target.checked)}
                      className="h-4 w-4 accent-brand"
                    />
                    Afficher les retirés
                  </label>

                  <Button size="sm" onClick={() => setEditingIngredient({ mode: 'create' })}>
                    <Plus size={16} className="mr-1.5" />
                    Nouvel ingrédient
                  </Button>
                </div>

                {ingredients.map((ingredient) => (
                  <div
                    key={ingredient.id}
                    className={cn(
                      'rounded-xl border bg-card p-4 flex items-center justify-between gap-3',
                      ingredient.hasDebt
                        ? 'border-destructive/40'
                        : ingredient.isLowStock
                          ? 'border-amber-300 dark:border-amber-900/60'
                          : 'border-border'
                    )}
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate">{ingredient.name}</p>
                      <div className="flex items-center gap-2 flex-wrap mt-0.5">
                        <span
                          className={cn(
                            'text-body-sm font-medium',
                            ingredient.hasDebt ? 'text-destructive' : 'text-muted-foreground'
                          )}
                        >
                          {ingredient.current_stock} {ingredient.unit}
                        </span>
                        {ingredient.isLowStock && !ingredient.hasDebt && (
                          <span className="inline-flex items-center gap-1 text-caption text-amber-600 dark:text-amber-400">
                            <AlertTriangle size={12} />
                            Stock bas
                          </span>
                        )}
                        {ingredient.expiringLotsCount > 0 && (
                          <span className="inline-flex items-center gap-1 text-caption text-amber-600 dark:text-amber-400">
                            <Clock size={12} />
                            {ingredient.expiringLotsCount} lot
                            {ingredient.expiringLotsCount > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* ⚠️ Zone de tap ≥ 44px — cohérent avec le reste du
                          module (mains humides en cuisine). */}
                      <button
                        type="button"
                        onClick={() => setEditingIngredient({ mode: 'edit', ingredient })}
                        className="h-11 w-11 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                        aria-label={`Modifier ${ingredient.name}`}
                      >
                        <Pencil size={16} />
                      </button>

                      {/* ⭐ Appro CIBLÉ : présélectionne l'ingrédient. C'est ce
                          que l'onglet Appro ne fait pas — d'où sa survie. */}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openSupply(ingredient.id)}
                      >
                        <Plus size={14} className="mr-1" />
                        Appro
                      </Button>

                      {/* ⭐ DÉCLARER UNE PERTE (09/08/2026). Le RPC
                          `discard_ingredient_lot` existait depuis le 02/08
                          mais AUCUN écran ne l'appelait : on ne pouvait rien
                          déclarer, ni en partie ni en totalité.
                          ⚠️ Masqué si l'ingrédient n'a plus de stock : sans
                          lot, il n'y a rien à perdre. */}
                      {ingredient.current_stock > 0 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setLossFor(ingredient)}
                          className="text-red-600 hover:text-red-700 dark:text-red-400"
                        >
                          <Trash2 size={14} className="mr-1" />
                          Perte
                        </Button>
                      )}

                      {/* ⭐ RETIRER DU CATALOGUE (09/08/2026). Soft delete : les
                          consommations passées continuent de le référencer.
                          ⛔ Le serveur REFUSE s'il reste du stock - ces
                          quantités disparaîtraient sans être comptées en perte.
                          ⚠️ Proposé MÊME avec du stock : le refus explique quoi
                          faire, alors qu'un bouton absent laisse chercher. */}
                      {ingredient.is_active ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setToRetire(ingredient)}
                          disabled={setIngredientActive.isPending}
                          aria-label={`Retirer ${ingredient.name} du catalogue`}
                        >
                          <X size={14} />
                        </Button>
                      ) : (
                        /* ⚠️ AUCUNE confirmation pour la remise : c'est le geste
                           qui RÉPARE, pas celui qui engage. */
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setIngredientActive.mutate({
                              ingredientId: ingredient.id,
                              active: true,
                            })
                          }
                          disabled={setIngredientActive.isPending}
                        >
                          Remettre
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ===== Onglet Péremption ===== */}
        {!isLoading && activeTab === 'expiring' && (
          <>
            {expiringLots.length === 0 ? (
              <EmptyState
                icon={Clock}
                message="Rien ne périme"
                subMessage={`Aucun lot n'arrive à expiration dans les ${EXPIRY_WINDOW_DAYS} prochains jours.`}
              />
            ) : (
              <div className="space-y-2">
                {expiringLots.map((lot) => {
                  const ingredient = ingredients.find((i) => i.id === lot.ingredient_id);
                  return (
                    <div
                      key={lot.id}
                      className="rounded-xl border border-amber-300 dark:border-amber-900/60 bg-card p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground truncate">
                            {ingredient?.name ?? 'Ingrédient'}
                          </p>
                          <p className="text-body-sm text-muted-foreground">
                            {lot.remaining_qty} {ingredient?.unit ?? ''} restant
                            {lot.remaining_qty > 1 ? 's' : ''}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          {/* ⭐ Valeur du lot à SON coût d'achat réel — ce que le
                              FEFO permet et que le CUMP interdit. */}
                          <p className="font-bold text-amber-700 dark:text-amber-400">
                            {formatPrice(Math.round(lot.remaining_qty * lot.unit_cost))}
                          </p>
                          <p className="text-caption text-muted-foreground">
                            expire le {lot.expires_at ? formatExpiryDate(lot.expires_at) : '—'}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Rappel discret des ingrédients à réapprovisionner */}
        {!isLoading && activeTab === 'stock' && lowStockIngredients.length > 0 && (
          <p className="text-caption text-muted-foreground text-center pt-2">
            {lowStockIngredients.length} ingrédient
            {lowStockIngredients.length > 1 ? 's' : ''} sous le seuil d'alerte
          </p>
        )}
      </div>

      {/* ⭐ RETRAIT DU CATALOGUE - confirmation avant le geste.
          ⚠️ Le message dit ce qui est PRÉSERVÉ : sans cela, « retirer » se
          lit comme « supprimer » et personne n'ose. */}
      <ConfirmationModal
        isOpen={toRetire !== null}
        onClose={() => setToRetire(null)}
        onConfirm={() => {
          if (toRetire) {
            setIngredientActive.mutate({ ingredientId: toRetire.id, active: false });
          }
          setToRetire(null);
        }}
        title="Retirer cet ingrédient ?"
        message={
          toRetire
            ? `« ${toRetire.name} » ne sera plus proposé à l'appro ni dans les recettes. Son historique de consommation est conservé - vous pourrez le remettre au catalogue à tout moment.`
            : ''
        }
        confirmLabel="Retirer"
        /* ⚠️ PAS `isDestructive` - defaut trouve en code review le
           09/08/2026. Le rouge signale l irreversible (jeter un lot, declarer
           une perte). Un retrait se defait en un clic : le peindre en rouge
           userait le signal la ou il compte vraiment. */
        isLoading={setIngredientActive.isPending}
      />

      {/* ⭐ DÉCLARER UNE PERTE sur un lot (09/08/2026).
          ⚠️ Le chargement des lots est délégué au loader : `useIngredientLots`
          ne doit s'exécuter QUE modale ouverte. Appelé depuis cette page, il
          partirait pour chaque ingrédient de la liste. */}
      <Modal
        open={lossFor !== null}
        onClose={() => setLossFor(null)}
        title="Déclarer une perte"
        description="La matière sort du stock : elle ne revient pas."
      >
        {lossFor && (
          <IngredientLossFormLoader
            barId={currentBar?.id}
            ingredientId={lossFor.id}
            ingredientName={lossFor.name}
            unit={lossFor.unit}
            isSubmitting={recordLotLoss.isPending}
            onCancel={() => setLossFor(null)}
            onSubmit={({ lotId, qty, reason }) => {
              recordLotLoss.mutate(
                { lotId, qty, reason },
                { onSuccess: () => setLossFor(null) }
              );
            }}
          />
        )}
      </Modal>

      <Modal
        open={showSupplyModal}
        onClose={() => setShowSupplyModal(false)}
        title="Nouvel approvisionnement"
      >
        <SupplyForm
          ingredients={ingredients}
          initialIngredientId={preselectedIngredient}
          resetSignal={resetSignal}
          isSubmitting={receiveSupply.isPending}
          onSubmit={handleSupply}
          onCancel={() => setShowSupplyModal(false)}
        />
      </Modal>

      {/*
        ⭐ §19.6 — COMPTAGE proposé JUSTE APRÈS l'appro : le tri se fait carton
        ouvert, pas trois heures après. Un écran différé ne serait jamais
        ouvert.
        ⚠️ Entièrement FACULTATIF - « Plus tard » ferme sans rien perdre :
        l'approvisionnement est déjà enregistré, seul le contrôle sera
        indisponible pour cette livraison.
      */}
      <Modal
        open={countingLot !== null}
        onClose={() => setCountingLot(null)}
        title="Répartir cette livraison par taille"
      >
        {countingLot && (
          <LotCountForm
            barId={currentBar?.id}
            lotId={countingLot.lotId}
            ingredientId={countingLot.ingredientId}
            onDone={() => setCountingLot(null)}
          />
        )}
      </Modal>

      <Modal
        open={editingIngredient !== null}
        onClose={() => setEditingIngredient(null)}
        title={
          editingIngredient?.mode === 'edit' ? 'Modifier l\'ingrédient' : 'Nouvel ingrédient'
        }
      >
        {editingIngredient && (
          <IngredientForm
            ingredient={
              editingIngredient.mode === 'edit' ? editingIngredient.ingredient : undefined
            }
            /**
             * ⚠️ L'unité est figée dès qu'un stock existe. On l'indique AVANT
             * la saisie plutôt que de laisser découvrir le refus serveur.
             *
             * ⭐ `current_stock !== 0` est une APPROXIMATION du garde serveur,
             * qui compte les lots actifs ET les recettes. Elle est
             * volontairement PLUS PERMISSIVE : le serveur reste la seule
             * autorité et refusera si besoin. L'inverse — bloquer côté client
             * un cas que le serveur accepterait — serait pire.
             */
            isUnitLocked={
              editingIngredient.mode === 'edit' &&
              editingIngredient.ingredient.current_stock !== 0
            }
            isSaving={upsertIngredient.isPending}
            onSave={handleSaveIngredient}
            onCancel={() => setEditingIngredient(null)}
          />
        )}

        {/*
          ⭐ §19.6 — TAILLES, sous le formulaire et non dedans.
          Elles passent par une RPC DISTINCTE de `upsert_ingredient` : les
          fondre dans le formulaire ferait croire à un seul enregistrement,
          alors que deux appels indépendants ont lieu.

          ⚠️ EN MODIFICATION SEULEMENT : la RPC exige un ingrédient EXISTANT.
          Le composant se masque LUI-MÊME sans `ingredientId` — la condition
          ici ne porte que sur le mode, pour ne pas dépendre de deux gardes
          qui pourraient diverger.
        */}
        {editingIngredient?.mode === 'edit' && (
          <div className="mt-4">
            <IngredientSizesEditor
              barId={currentBar?.id}
              ingredientId={editingIngredient.ingredient.id}
              ingredientName={editingIngredient.ingredient.name}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}

IngredientsPage.displayName = 'IngredientsPage';
