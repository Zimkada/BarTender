/**
 * KitchenSummaryCards
 * Cartes du Dashboard en portée RESTAU — §8, §9.
 *
 * ⭐⭐ CE BLOC REMPLACE, IL NE COMPLÈTE PAS.
 *
 * En portée Restau, trois cartes du Dashboard n'ont aucun sens :
 *   · Retours       — un plat ne se retourne pas (§13.1)
 *   · Consignations — réservées aux bouteilles
 *   · Alertes stock — porte sur `bar_products`, pas sur les ingrédients
 *
 * ⛔ Les masquer laisserait un écran à trous. Les afficher à zéro
 * suggérerait qu'un plat POURRAIT être retourné. On les remplace donc par
 * ce que la cuisine a de réellement utile à dire.
 *
 * ⭐ AUCUN CALCUL NOUVEAU : `useUnifiedKitchenQueue` expose déjà les trois
 * états de la file, et `useUnifiedKitchen` les alertes ingrédients. Les
 * queries sont partagées avec l'écran Service — donc en cache.
 *
 * ⚠️ §3 — les deux hooks portent `enabled: hasRestaurant` : sur un bar pur,
 * aucune requête ne part et ce composant n'est jamais monté.
 */

import { ChefHat, Flame, HandPlatter, AlertTriangle, Carrot, Clock } from 'lucide-react';
import { useUnifiedKitchenQueue } from '../../hooks/pivots/useUnifiedKitchenQueue';
import { useUnifiedKitchen } from '../../hooks/pivots/useUnifiedKitchen';
import { useKitchenMetrics } from '../../hooks/queries/useKitchenQueries';
import { useAuth } from '../../context/AuthContext';
import { useCurrencyFormatter } from '../../hooks/useBeninCurrency';

interface Props {
  barId: string | undefined;
  /** Journée commerciale courante, au format `YYYY-MM-DD`. */
  businessDate: string;
}

interface CardProps {
  label: string;
  value: number | string;
  hint: string;
  icon: React.ReactNode;
  tone?: 'neutral' | 'warn' | 'danger';
}

function Card({ label, value, hint, icon, tone = 'neutral' }: CardProps) {
  const border =
    tone === 'danger'
      ? 'border-red-200 dark:border-red-900/40'
      : tone === 'warn'
        ? 'border-amber-200 dark:border-amber-900/40'
        : 'border-border';

  const iconBg =
    tone === 'danger'
      ? 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400'
      : tone === 'warn'
        ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400'
        : 'bg-brand-subtle text-brand-primary';

  const valueColor =
    tone === 'danger' ? 'text-red-600 dark:text-red-400' : 'text-foreground';

  return (
    <div
      className={`bg-card rounded-2xl p-4 shadow-sm border ${border} hover:shadow-md transition-shadow`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${iconBg}`}>
          {icon}
        </div>
        <span className="text-micro text-muted-foreground">{label}</span>
      </div>
      <div className={`text-h2 font-semibold tabular-nums ${valueColor}`}>{value}</div>
      <p className="text-caption text-muted-foreground mt-1">{hint}</p>
    </div>
  );
}

export function KitchenSummaryCards({ barId, businessDate }: Props) {
  const { hasPermission } = useAuth();
  const { formatPrice } = useCurrencyFormatter();

  const { counts } = useUnifiedKitchenQueue(barId);

  /**
   * ⛔ STOCK INGREDIENTS reserve a qui gere la cuisine — defaut trouve a la
   * code review du 05/08/2026.
   *
   * Le SERVEUR accede au Dashboard et peut basculer en portee Restau, mais il
   * n a PAS acces a l ecran Ingredients (menu reserve promoteur / gerant /
   * cuisinier). Charger ces donnees pour lui ELARGIRAIT une exposition qui
   * n existe pas ailleurs — les lots portent `unit_cost`, un montant.
   * ⚠️ `canManageIngredientStock` est la permission de cet ecran : on
   * s aligne dessus plutot que d inventer une regle.
   */
  const canSeeIngredients = hasPermission('canManageIngredientStock');
  const { lowStockIngredients, ingredientsInDebt, expiringLots } =
    useUnifiedKitchen(canSeeIngredients ? barId : undefined);
  const { data: metrics } = useKitchenMetrics(barId, businessDate, businessDate);

  /**
   * ⚠️ Le coût des pertes est un MONTANT : réservé à qui peut voir les
   * montants (§8). Le compteur, lui, reste visible — savoir que 3 plats ont
   * été perdus est une information de production, pas de gestion.
   */
  const canViewCosts = hasPermission('canViewKitchenCosts');

  /**
   * ⭐ Une seule carte pour les ingrédients : stock bas, dettes et
   * péremptions se traitent par le MÊME geste — aller voir l'écran
   * Ingrédients. Trois cartes distinctes fragmenteraient une action unique.
   * ⚠️ `ingredientsInDebt` compte double avec `lowStockIngredients` (un stock
   * négatif est aussi bas), mais rien ne garantit l'INCLUSION d'un ensemble
   * dans l'autre.
   *
   * ⛔ `Math.max` ÉTAIT FAUX — défaut trouvé à la code review du 05/08/2026.
   * 3 ingrédients bas + 2 en dette NON inclus dans les 3 = 5 alertes réelles,
   * mais `max(3, 2)` en affichait 3. Et la LISTE, elle, dédoublonne par id :
   * le compteur et la liste auraient montré des nombres DIFFÉRENTS sur le
   * même écran.
   *
   * ⭐ Même règle des deux côtés : un Set d'identifiants. C'est la seule
   * façon de garantir qu'ils ne divergent pas.
   */
  const ingredientAlerts = new Set([
    ...lowStockIngredients.map((i) => i.id),
    ...ingredientsInDebt.map((i) => i.id),
  ]).size;
  const totalAlerts = ingredientAlerts + expiringLots.length;

  return (
    <>
      {/* ⭐ À FAIRE — ce que la cuisine n'a pas encore commencé. */}
      <Card
        label="À faire"
        value={counts.todo}
        hint="plats en attente"
        icon={<ChefHat size={18} />}
        tone={counts.todo > 0 ? 'warn' : 'neutral'}
      />

      <Card
        label="En cours"
        value={counts.doing}
        hint="en préparation"
        icon={<Flame size={18} />}
      />

      {/* ⭐⭐ PRÊT — la carte la plus ACTIONNABLE du bloc : ces plats ont déjà
          coûté leur matière et refroidissent. Un chiffre qui monte pendant le
          service signale un problème de salle, pas de cuisine. */}
      <Card
        label="Prêt"
        value={counts.done}
        hint="à servir maintenant"
        icon={<HandPlatter size={18} />}
        tone={counts.done > 0 ? 'warn' : 'neutral'}
      />

      {/* ⭐ INGRÉDIENTS — remplace « Alertes stock », qui porte sur les
          boissons (`bar_products`) et n'a rien à dire de la cuisine.
          ⛔ Masquee au SERVEUR : il n a pas acces a l ecran Ingredients, une
          carte l y renvoyant serait un cul-de-sac. */}
      {canSeeIngredients && (
      <Card
        label="Ingrédients"
        value={totalAlerts}
        /* ⚠️ `expiringLots` compte des LOTS, pas des ingrédients : deux lots
           du même produit comptent deux fois. C'est VOULU — chacun demande
           une décision (l'utiliser avant sa date), donc chacun est une unité
           d'action. Le libellé dit « lots » pour lever l'ambiguïté. */
        hint={
          expiringLots.length > 0
            ? `dont ${expiringLots.length} lot${expiringLots.length > 1 ? 's' : ''} à écouler`
            : 'stock à surveiller'
        }
        icon={<Carrot size={18} />}
        tone={totalAlerts > 0 ? 'danger' : 'neutral'}
      />
      )}

      {/* ⭐⭐ PERTES — la métrique qu'aucun tableur ne calcule : matière
          sortie, vente jamais née (§8). */}
      <Card
        label="Pertes"
        value={metrics?.loss_count ?? 0}
        hint={
          canViewCosts && (metrics?.loss_count ?? 0) > 0
            ? formatPrice(metrics?.loss_cost ?? 0)
            : 'plats jetés aujourd’hui'
        }
        icon={<AlertTriangle size={18} />}
        tone={(metrics?.loss_count ?? 0) > 0 ? 'danger' : 'neutral'}
      />

      {/* ⚠️ Temps de préparation — « — » et jamais 0 quand aucun plat n'a
          atteint `ready` : une moyenne sur zéro mesure serait trompeuse. */}
      <Card
        label="Préparation"
        value={metrics?.avg_prep_min != null ? `${metrics.avg_prep_min} min` : '—'}
        hint="commande → prêt"
        icon={<Clock size={18} />}
      />
    </>
  );
}

/**
 * Panneau « Points de vigilance » en portée RESTAU.
 *
 * ⭐ Remplace la liste des BOISSONS en stock bas, qui n'a rien à dire de la
 * cuisine : ses alertes portent sur `bar_products`, une table où un
 * ingrédient n'existe pas.
 *
 * ⚠️ Trois natures d'alerte dans UNE seule liste — stock bas, dette,
 * péremption. Elles appellent le même geste : aller voir l'écran
 * Ingrédients. Les séparer fragmenterait une action unique.
 */
export function KitchenVigilanceList({ barId }: { barId: string | undefined }) {
  const { hasPermission } = useAuth();
  /**
   * ⛔ MEME GARDE que la carte Ingredients : le SERVEUR n a pas acces a
   * l ecran Ingredients, lui charger ces donnees elargirait une exposition
   * inexistante ailleurs (les lots portent un cout unitaire).
   */
  const canSeeIngredients = hasPermission('canManageIngredientStock');
  const { lowStockIngredients, ingredientsInDebt, expiringLots } =
    useUnifiedKitchen(canSeeIngredients ? barId : undefined);

  /**
   * ⚠️ DÉDOUBLONNAGE par id : un ingrédient en dette est AUSSI en stock bas
   * (un stock négatif est sous n'importe quel seuil). Sans cette Map, il
   * apparaîtrait deux fois dans la liste.
   * ⭐ Les DETTES d'abord : un stock négatif est plus urgent qu'un seuil
   * franchi — la matière a déjà été consommée sans être approvisionnée.
   */
  const alerts = new Map<string, { id: string; name: string; stock: number; isDebt: boolean }>();
  for (const i of ingredientsInDebt) {
    alerts.set(i.id, { id: i.id, name: i.name, stock: i.current_stock, isDebt: true });
  }
  for (const i of lowStockIngredients) {
    if (!alerts.has(i.id)) {
      alerts.set(i.id, { id: i.id, name: i.name, stock: i.current_stock, isDebt: false });
    }
  }
  const list = Array.from(alerts.values());

  // ⚠️ Sans la permission, le panneau ne dit RIEN plutot que « tout va bien » :
  // affirmer que les stocks sont sains sur des donnees non chargees serait
  // un mensonge.
  if (!canSeeIngredients) {
    return (
      <p className="py-8 text-center text-caption text-muted-foreground">
        Le suivi des ingrédients est réservé à la gestion.
      </p>
    );
  }

  if (list.length === 0 && expiringLots.length === 0) {
    return (
      <div className="py-8 text-center bg-green-50 dark:bg-green-950/30 rounded-xl border border-dashed border-green-200 dark:border-green-900/40">
        <p className="text-body-sm text-green-700 dark:text-green-400 font-medium">
          Tous vos ingrédients sont au-dessus des seuils ✓
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {list.slice(0, 5).map((i) => (
        <div key={i.id} className="flex justify-between items-center py-1">
          <span className="text-body-sm text-foreground/80 truncate min-w-0">
            {i.name}
          </span>
          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
            {/* ⭐ « Manque » et non « Restant » sur une dette : un stock
                négatif n'est pas un reste, c'est un découvert (§13.2). */}
            <span className="text-caption text-muted-foreground">
              {i.isDebt ? 'Manque' : 'Restant'}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-caption font-semibold tabular-nums">
              {i.isDebt ? Math.abs(i.stock) : i.stock}
            </span>
          </div>
        </div>
      ))}

      {/* ⚠️ Les péremptions sont comptées à part : ce n'est pas un manque de
          stock mais une matière qui va être PERDUE si elle n'est pas
          utilisée — un geste différent (cuisiner, pas commander). */}
      {expiringLots.length > 0 && (
        <p className="text-caption text-amber-700 dark:text-amber-400 pt-1">
          {expiringLots.length} lot{expiringLots.length > 1 ? 's' : ''} arrive
          {expiringLots.length > 1 ? 'nt' : ''} à péremption
        </p>
      )}
    </div>
  );
}
