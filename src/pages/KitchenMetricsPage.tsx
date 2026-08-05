/**
 * KitchenMetricsPage
 * Rentabilité cuisine — les 4 métriques du §8.
 *
 * ⭐⭐ PAGE DÉDIÉE, PAS UN ONGLET DE « PLATS » — décision du 05/08/2026.
 * Le CUISINIER a `canManageRecipes` (il accède donc à Plats) mais PAS
 * `canViewKitchenCosts` : « il voit les QUANTITÉS, pas les MONTANTS » (§8).
 * Un onglet sur DishesPage aurait exposé marges et pertes à qui ne doit pas
 * les voir. La séparation des pages fait porter la garde par la ROUTE.
 *
 * ⭐ CE QUE CET ÉCRAN JUSTIFIE : le module coûte de la saisie au promoteur
 * (ingrédients, recettes, appros) et ne lui rendait jusqu'ici que de
 * l'organisation. C'est ici que cette saisie devient une information qu'il
 * n'avait pas.
 */

import { useState, useMemo } from 'react';
import { TrendingUp, TrendingDown, Clock, AlertTriangle, UtensilsCrossed } from 'lucide-react';
import { SimplePageHeader } from '../components/common/PageHeader';
import { EmptyState } from '../components/common/EmptyState';
import { useBarContext } from '../context/BarContext';
import { useKitchenMetrics } from '../hooks/queries/useKitchenQueries';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { LOW_MARGIN_THRESHOLD } from '../components/kitchen/RecipeEditor';
import { cn } from '../lib/utils';
import type { DishMetrics } from '../services/supabase/kitchen.service';

/** Fenêtres proposées. 30 j par défaut — assez pour lisser un service creux. */
const PERIODS = [
  { days: 7, label: '7 jours' },
  { days: 30, label: '30 jours' },
  { days: 90, label: '90 jours' },
] as const;

/** `YYYY-MM-DD` local — jamais `toISOString()`, qui décale d'un jour en UTC-. */
function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface StatProps {
  label: string;
  value: string;
  hint?: string;
  tone?: 'neutral' | 'good' | 'warn' | 'bad';
  icon?: React.ReactNode;
}

function Stat({ label, value, hint, tone = 'neutral', icon }: StatProps) {
  return (
    <div
      className={cn(
        'rounded-xl border p-4',
        tone === 'good' && 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30',
        tone === 'warn' && 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30',
        tone === 'bad' && 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30',
        tone === 'neutral' && 'border-border bg-card'
      )}
    >
      <div className="flex items-center gap-1.5 text-caption text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-1 text-h2 font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-caption text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function KitchenMetricsPage() {
  const { currentBar } = useBarContext();
  const { formatPrice } = useCurrencyFormatter();
  const [days, setDays] = useState<number>(30);

  const startDate = useMemo(() => daysAgo(days), [days]);
  const { data, isLoading } = useKitchenMetrics(currentBar?.id, startDate);

  const marginIsLow =
    data?.margin_rate != null && data.margin_rate < LOW_MARGIN_THRESHOLD;

  /**
   * ⭐ Le plat le PLUS rentable, et le MOINS. Le classement complet est en
   * dessous ; ces deux-là sont ce que le promoteur retient.
   * ⚠️ Filtrés sur `sold_count > 0` : un plat jamais vendu n'a ni le mérite
   * du premier ni le tort du dernier.
   */
  const sold = useMemo(
    () => (data?.dishes ?? []).filter((d) => d.sold_count > 0),
    [data?.dishes]
  );

  const hasData = (data?.served_count ?? 0) > 0 || sold.length > 0;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-24 pt-4">
      <SimplePageHeader
        title="Rentabilité"
        subtitle="Ce que la cuisine rapporte vraiment"
        icon={<TrendingUp className="h-5 w-5" />}
      />

      {/* Sélecteur de période */}
      <div className="mt-4 inline-flex rounded-full border border-border bg-muted p-0.5">
        {PERIODS.map((p) => (
          <button
            key={p.days}
            type="button"
            onClick={() => setDays(p.days)}
            className={cn(
              'rounded-full px-3 py-1.5 text-caption transition-all',
              days === p.days
                ? 'bg-card font-semibold text-brand-primary shadow-sm'
                : 'font-medium text-muted-foreground hover:text-foreground'
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="mt-8 text-center text-body text-muted-foreground">
          Calcul en cours…
        </p>
      ) : !hasData ? (
        <div className="mt-8">
          <EmptyState
            icon={UtensilsCrossed}
            message="Aucun plat servi sur cette période"
            subMessage="Les chiffres apparaîtront dès les premiers services."
          />
        </div>
      ) : (
        <>
          {/* ═══ LES 4 MÉTRIQUES ═══ */}
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label="Plats servis"
              value={String(data?.served_count ?? 0)}
              hint={formatPrice(data?.revenue ?? 0)}
            />

            <Stat
              label="Marge matière"
              value={
                /* ⚠️ « — » et jamais 0 % : un taux sur un CA nul n'a pas de
                   sens mathématique. Même règle que calculate_dish_cost. */
                data?.margin_rate != null ? `${data.margin_rate} %` : '—'
              }
              hint={formatPrice(data?.margin ?? 0)}
              tone={marginIsLow ? 'bad' : 'good'}
              icon={marginIsLow ? <TrendingDown size={13} /> : <TrendingUp size={13} />}
            />

            {/* ⭐⭐ LA MÉTRIQUE QU'AUCUN TABLEUR NE CALCULE. */}
            <Stat
              label="Pertes"
              value={String(data?.loss_count ?? 0)}
              hint={formatPrice(data?.loss_cost ?? 0)}
              tone={(data?.loss_count ?? 0) > 0 ? 'warn' : 'neutral'}
              icon={<AlertTriangle size={13} />}
            />

            <Stat
              label="Préparation"
              value={data?.avg_prep_min != null ? `${data.avg_prep_min} min` : '—'}
              hint="moyenne commande → prêt"
              icon={<Clock size={13} />}
            />
          </div>

          {/* ⚠️ EN ATTENTE — affiché SÉPARÉMENT des pertes, jamais additionné.
              Ces plats ont coûté leur matière mais restent SERVABLES : c'est
              un signal d'action, pas un constat comptable. */}
          {(data?.pending_count ?? 0) > 0 && (
            <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-caption text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              <strong>{data?.pending_count} plat(s) prêt(s)</strong> attendent
              d'être servis ({formatPrice(data?.pending_cost ?? 0)} de matière déjà
              sortie). Ce ne sont pas encore des pertes.
            </p>
          )}

          {/* ═══ CLASSEMENT PAR PLAT ═══ */}
          {sold.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-3 text-caption font-semibold uppercase tracking-wide text-muted-foreground">
                Par plat
              </h2>
              <ul className="space-y-2">
                {sold.map((d) => (
                  <DishRow key={d.dish_id} dish={d} formatPrice={formatPrice} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

interface RowProps {
  dish: DishMetrics;
  formatPrice: (v: number) => string;
}

function DishRow({ dish, formatPrice }: RowProps) {
  const isLow = dish.margin_rate != null && dish.margin_rate < LOW_MARGIN_THRESHOLD;

  return (
    <li className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">{dish.dish_name}</p>
        <p className="text-caption text-muted-foreground">
          {dish.sold_count} servi{dish.sold_count > 1 ? 's' : ''} •{' '}
          {formatPrice(dish.revenue)}
          {/* ⭐ La perte PAR PLAT : « 12 000 F de pertes » ne dit rien,
              « 12 000 F sur le poisson » désigne une portion mal calibrée. */}
          {dish.loss_count > 0 && (
            <span className="text-amber-700 dark:text-amber-500">
              {' '}• {dish.loss_count} perdu(s)
            </span>
          )}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p
          className={cn(
            'font-bold tabular-nums',
            isLow ? 'text-red-700 dark:text-red-400' : 'text-green-700 dark:text-green-400'
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

KitchenMetricsPage.displayName = 'KitchenMetricsPage';
