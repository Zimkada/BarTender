/**
 * KitchenAnalyticsBlock
 * Métriques propres à la cuisine — §8, dans l'onglet Analytique.
 *
 * ⭐⭐ CE BLOC N'AFFICHE QUE CE QUE `sales` NE PEUT PAS DIRE.
 *
 * `AnalyticsView` calcule déjà CA, ventes et panier moyen depuis les ventes,
 * filtrés par portée. Trois métriques du §8 lui sont pourtant INACCESSIBLES :
 *
 *   · le COÛT MATIÈRE  → `computed_cost` vit dans `kitchen_order_items`
 *   · les PERTES       → un plat cuisiné jamais servi n'a AUCUNE vente,
 *                        donc n'existe nulle part dans `sales`
 *   · le TEMPS de prépa → `ready_at` n'est pas reporté dans la vente
 *
 * ⛔ LE CA N'EST PAS RÉAFFICHÉ ICI, alors que la RPC le renvoie. Une seule
 * source par chiffre : si le cache des ventes était légèrement en retard sur
 * le serveur, l'écran montrerait DEUX CA différents et personne ne saurait
 * lequel croire. C'est le défaut déjà corrigé deux fois sur ce chantier
 * (create_sale_idempotent, itemMatchesScope) — on ne le réintroduit pas.
 *
 * ⚠️ MONTANTS = donnée de gestion. Le bloc exige `canViewKitchenCosts`, que
 * le cuisinier n'a PAS : « il voit les quantités, pas les montants » (§8).
 * La route `/sales` n'ayant aucune garde de permission, cette vérification
 * est le SEUL rempart.
 */

import { useMemo } from 'react';
import { TrendingDown, TrendingUp, Clock, AlertTriangle } from 'lucide-react';
import { useKitchenMetrics } from '../../hooks/queries/useKitchenQueries';
import { useAuth } from '../../context/AuthContext';
import { LOW_MARGIN_THRESHOLD } from './RecipeEditor';
import { dateToYYYYMMDD } from '../../utils/businessDateHelpers';
import { cn } from '../../lib/utils';
import type { DishMetrics } from '../../services/supabase/kitchen.service';

interface Props {
  barId: string | undefined;
  /** Bornes de la période — LES MÊMES que celles des KPI ventes. */
  startDate: Date;
  endDate: Date;
  formatPrice: (price: number) => string;
  isMobile?: boolean;
}

export function KitchenAnalyticsBlock({
  barId,
  startDate,
  endDate,
  formatPrice,
  isMobile = false,
}: Props) {
  const { hasPermission } = useAuth();

  /**
   * ⚠️ Bornes converties AVANT l'appel, avec l'helper du projet :
   * `toISOString()` décalerait d'un jour sur un fuseau négatif, et la RPC
   * attend `YYYY-MM-DD`.
   * ⭐ Ce sont les MÊMES dates que les KPI ventes — sans quoi les deux blocs
   * couvriraient des périodes différentes sur le même écran.
   */
  const start = useMemo(() => dateToYYYYMMDD(startDate), [startDate]);
  const end = useMemo(() => dateToYYYYMMDD(endDate), [endDate]);

  const canViewCosts = hasPermission('canViewKitchenCosts');
  const { data, isLoading } = useKitchenMetrics(barId, start, end);

  // ⛔ Montants réservés à la gestion. Rendu APRÈS les hooks — jamais avant,
  // l'ordre des hooks ne doit pas dépendre d'une permission.
  if (!canViewCosts) return null;

  if (isLoading) {
    return (
      <p className="py-6 text-center text-caption text-muted-foreground">
        Calcul des marges cuisine…
      </p>
    );
  }

  // ⚠️ Aucun plat servi ET aucune perte : rien à dire. Un bloc vide sous les
  // KPI ventes laisserait croire à un défaut de chargement.
  const hasAnything =
    (data?.served_count ?? 0) > 0 ||
    (data?.loss_count ?? 0) > 0 ||
    (data?.pending_count ?? 0) > 0;
  if (!data || !hasAnything) return null;

  const marginIsLow = data.margin_rate != null && data.margin_rate < LOW_MARGIN_THRESHOLD;
  const soldDishes = (data.dishes ?? []).filter((d) => d.sold_count > 0);

  return (
    <section className="space-y-3" data-guide="kitchen-analytics">
      <h4 className="text-micro uppercase tracking-wide text-brand-primary">
        Rentabilité cuisine
      </h4>

      <div className={cn('grid gap-3', isMobile ? 'grid-cols-2' : 'grid-cols-3')}>
        {/* ⭐ MARGE MATIÈRE — inaccessible depuis `sales` : le coût réel est
            figé à `ready`, dans kitchen_order_items. */}
        <div
          className={cn(
            'rounded-xl border p-4',
            marginIsLow
              ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30'
              : 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30'
          )}
        >
          <h5 className="mb-1 flex items-center gap-1 text-micro text-muted-foreground">
            {marginIsLow ? <TrendingDown size={12} /> : <TrendingUp size={12} />}
            Marge matière
          </h5>
          <p className="text-h2 font-semibold tabular-nums">
            {/* ⚠️ « — » et JAMAIS 0 % : un taux sur un CA nul n'a pas de sens
                mathématique. Même règle que calculate_dish_cost. */}
            {data.margin_rate != null ? `${data.margin_rate} %` : '—'}
          </p>
          <p className="mt-1 text-caption text-muted-foreground tabular-nums">
            {formatPrice(data.margin)} sur {formatPrice(data.cost)} de matière
          </p>
        </div>

        {/* ⭐⭐ LES PERTES — la métrique qu'aucun tableur ne calcule.
            Un plat cuisiné puis annulé n'apparaît dans AUCUNE vente. */}
        <div
          className={cn(
            'rounded-xl border p-4',
            data.loss_count > 0
              ? 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30'
              : 'border-border bg-card'
          )}
        >
          <h5 className="mb-1 flex items-center gap-1 text-micro text-muted-foreground">
            <AlertTriangle size={12} />
            Pertes cuisine
          </h5>
          <p className="text-h2 font-semibold tabular-nums">{data.loss_count}</p>
          <p className="mt-1 text-caption text-muted-foreground tabular-nums">
            {formatPrice(data.loss_cost)} de matière perdue
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <h5 className="mb-1 flex items-center gap-1 text-micro text-muted-foreground">
            <Clock size={12} />
            Préparation
          </h5>
          <p className="text-h2 font-semibold tabular-nums">
            {data.avg_prep_min != null ? `${data.avg_prep_min} min` : '—'}
          </p>
          <p className="mt-1 text-caption text-muted-foreground">
            commande → prêt
          </p>
        </div>
      </div>

      {/* ⚠️ EN ATTENTE — JAMAIS additionné aux pertes. Ces plats ont coûté
          leur matière mais restent SERVABLES : signal d'action, pas constat
          comptable. Les confondre ferait passer un service en cours pour une
          catastrophe, et le gérant cesserait de croire le chiffre. */}
      {data.pending_count > 0 && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-caption text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <strong>{data.pending_count} plat(s) prêt(s)</strong> attendent d'être
          servis ({formatPrice(data.pending_cost)} de matière déjà sortie).
          Ce ne sont pas encore des pertes.
        </p>
      )}

      {/* ⭐ Classement — c'est ce qui rend la marge ACTIONNABLE : « 20 % » ne
          dit pas quel plat corriger. */}
      {soldDishes.length > 0 && (
        <ul className="space-y-1.5">
          {soldDishes.map((dish) => (
            <DishRow key={dish.dish_id} dish={dish} formatPrice={formatPrice} />
          ))}
        </ul>
      )}
    </section>
  );
}

function DishRow({
  dish,
  formatPrice,
}: {
  dish: DishMetrics;
  formatPrice: (v: number) => string;
}) {
  const isLow = dish.margin_rate != null && dish.margin_rate < LOW_MARGIN_THRESHOLD;

  return (
    <li className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-body-sm font-medium text-foreground">
          {dish.dish_name}
        </p>
        <p className="text-caption text-muted-foreground tabular-nums">
          {dish.sold_count} servi{dish.sold_count > 1 ? 's' : ''}
          {/* ⭐ La perte PAR PLAT : « 12 000 F de pertes » ne dit rien,
              « sur le poisson » désigne une portion mal calibrée. */}
          {dish.loss_count > 0 && (
            <span className="text-amber-700 dark:text-amber-500">
              {' '}• {dish.loss_count} perdu{dish.loss_count > 1 ? 's' : ''}
            </span>
          )}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p
          className={cn(
            'font-semibold tabular-nums',
            isLow
              ? 'text-red-700 dark:text-red-400'
              : 'text-green-700 dark:text-green-400'
          )}
        >
          {dish.margin_rate != null ? `${dish.margin_rate} %` : '—'}
        </p>
        <p className="text-caption text-muted-foreground tabular-nums">
          {formatPrice(dish.margin)}
        </p>
      </div>
    </li>
  );
}
