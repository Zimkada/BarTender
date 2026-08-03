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
import { Package, AlertTriangle, Clock, Plus, TrendingDown, ChefHat } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { TabbedPageHeader } from '../components/common/PageHeader';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/common/EmptyState';
import { SupplyForm, type SupplyFormValues } from '../components/kitchen/SupplyForm';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { useUnifiedKitchen } from '../hooks/pivots/useUnifiedKitchen';
import { useIngredientMutations } from '../hooks/mutations/useIngredientMutations';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { cn } from '../lib/utils';

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
type TabId = 'stock' | 'expiring' | 'supply';

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
  const [preselectedIngredient, setPreselectedIngredient] = useState<string | undefined>();
  /** Incrémenté après un enregistrement confirmé → nouvelle clé d'idempotence. */
  const [resetSignal, setResetSignal] = useState(0);

  const {
    ingredients,
    expiringLots,
    expiringValue,
    lowStockIngredients,
    ingredientsInDebt,
    isLoading,
  } = useUnifiedKitchen(currentBar?.id, EXPIRY_WINDOW_DAYS);

  const { receiveSupply } = useIngredientMutations();

  const openSupply = (ingredientId?: string) => {
    setPreselectedIngredient(ingredientId);
    setShowSupplyModal(true);
  };

  const handleSupply = (values: SupplyFormValues) => {
    receiveSupply.mutate(values, {
      onSuccess: () => {
        // ⚠️ Le signal n'est envoyé QU'APRÈS confirmation : renouveler la clé
        // avant la réponse annulerait la protection anti-double-clic.
        setResetSignal((n) => n + 1);
        setShowSupplyModal(false);
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

        {isLoading && activeTab !== 'supply' && (
          <p className="text-center text-muted-foreground py-8">Chargement…</p>
        )}

        {/* ===== Onglet Stock ===== */}
        {!isLoading && activeTab === 'stock' && (
          <>
            {ingredients.length === 0 ? (
              <EmptyState
                icon={Package}
                message="Aucun ingrédient"
                subMessage="Enregistrez un approvisionnement pour suivre le coût réel de vos plats."
                // ⭐ Une action, pas seulement un constat. Avant le découpage,
                // le bouton « Appro » de l'en-tête offrait cette porte de
                // sortie ; sans lui, le message resterait un cul-de-sac.
                // ⚠️ Masquée au cuisinier : il ne voit pas l'onglet Appro (§9),
                // le bouton l'enverrait vers un onglet inexistant pour lui.
                action={
                  canViewCosts ? (
                    <Button onClick={() => setActiveTab('supply')}>
                      <Plus size={16} className="mr-1.5" />
                      Enregistrer un appro
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div className="space-y-2">
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

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openSupply(ingredient.id)}
                      className="shrink-0"
                    >
                      <Plus size={14} className="mr-1" />
                      Appro
                    </Button>
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
    </div>
  );
}

IngredientsPage.displayName = 'IngredientsPage';
