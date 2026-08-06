/**
 * KitchenProductionPanel
 * « Mon activité » — ce que le cuisinier a produit et ce qui a été perdu.
 *
 * ⭐⭐ POURQUOI CET ÉCRAN EXISTE
 * `getQueue` ne charge que pending/accepted/preparing/ready : dès qu'un plat
 * passe à `served` ou `cancelled`, il DISPARAÎT. En fin de service, l'écran
 * du cuisinier est vide — il n'a aucune trace de son travail.
 *
 * ⭐ Et surtout : une PERTE, c'est de la matière sortie sans vente. La seule
 * personne qui la voyait jusqu'ici était le gérant, dans « Rentabilité
 * cuisine ». Or c'est le cuisinier qui peut agir dessus (portion mal
 * calibrée, sur-production, plat lancé trop tôt). Celui qui peut corriger le
 * problème était le seul à ne jamais le voir.
 *
 * ⛔⛔ AUCUN MONTANT N'EST AFFICHÉ ICI, ET AUCUN N'EST REÇU.
 * Le §8 est explicite : le cuisinier « voit les quantités, pas les montants ».
 * La protection ne tient PAS à ce composant mais à la RPC
 * `get_kitchen_production`, qui ne calcule aucun montant — ce qui n'est pas
 * sélectionné ne peut pas fuir. Masquer côté UI aurait laissé les montants
 * lisibles dans l'onglet Réseau.
 *
 * ⚠️ REPLIÉ PAR DÉFAUT, et ce n'est pas un détail : cet écran sert PENDANT le
 * service. La file doit rester la première chose visible — un bilan déployé
 * en permanence pousserait les plats à préparer sous la ligne de flottaison.
 */

import { useState } from 'react';
import { ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, Clock, Flame } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useKitchenProduction } from '../../hooks/queries/useKitchenQueries';
import { useDateRangeFilter } from '../../hooks/useDateRangeFilter';
import { PeriodFilter } from '../common/filters/PeriodFilter';
import { dateToYYYYMMDD } from '../../utils/businessDateHelpers';
import { useBarContext } from '../../context/BarContext';
import type { TimeRange } from '../../types/dateFilters';

interface Props {
  barId: string | undefined;
}

/**
 * ⭐ LE SÉLECTEUR DU PROJET, PAS UN SÉLECTEUR MAISON.
 *
 * ⛔ Une première version proposait deux boutons « Aujourd'hui / 7 jours »
 * écrits à la main, avec un calcul de dates local. Trois défauts :
 *   · elle IGNORAIT la journée commerciale — sur un bar qui ferme à 6h, les
 *     plats de 2h du matin seraient tombés dans le mauvais jour, alors que
 *     `useDateRangeFilter(closeHour)` gère précisément ce cas ;
 *   · elle dupliquait un composant partagé qui gère déjà le responsive
 *     (`shortLabel` sur mobile) et le theming dynamique par bar ;
 *   · elle divergeait du reste de l'app : partout ailleurs le même bandeau.
 *
 * ⚠️ On RESTREINT via `availableFilters` plutôt que de tout offrir : le
 * cuisinier raisonne en services, pas en trimestres. Les fenêtres longues
 * relèvent de « Rentabilité cuisine », côté gérant, avec les montants.
 */
const KITCHEN_RANGES: TimeRange[] = ['today', 'yesterday', 'last_7days', 'last_30days'];

function Stat({
  label,
  value,
  hint,
  icon,
  tone = 'neutral',
}: {
  label: string;
  value: number | string;
  hint: string;
  icon: React.ReactNode;
  tone?: 'neutral' | 'good' | 'warn';
}) {
  return (
    <div
      className={cn(
        'rounded-xl border p-3',
        tone === 'warn'
          ? 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30'
          : tone === 'good'
            ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30'
            : 'border-border bg-card'
      )}
    >
      <h5 className="mb-1 flex items-center gap-1 text-micro text-muted-foreground">
        {icon}
        {label}
      </h5>
      <p className="text-h2 font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-caption text-muted-foreground">{hint}</p>
    </div>
  );
}

export function KitchenProductionPanel({ barId }: Props) {
  const [open, setOpen] = useState(false);
  const { currentBar } = useBarContext();

  /**
   * ⭐ `closeHour` du bar : c'est lui qui rend « Aujourd'hui » JUSTE sur un
   * bar qui ferme après minuit. Un plat commandé à 2h appartient au service
   * de la veille — un calcul de dates civil l'aurait rangé dans le mauvais
   * jour, et le cuisinier aurait vu son service coupé en deux.
   */
  const { timeRange, setTimeRange, currentPeriod, customRange, updateCustomRange } =
    useDateRangeFilter({
      defaultRange: 'today',
      closeHour: currentBar?.closingHour,
    });

  // ⚠️ La RPC attend `YYYY-MM-DD` : helper du projet, jamais `toISOString()`
  // qui décalerait d'un jour sur un fuseau négatif.
  const start = dateToYYYYMMDD(currentPeriod.startDate);
  const end = dateToYYYYMMDD(currentPeriod.endDate);

  /**
   * ⚠️ `enabled` est porté par le hook (`hasRestaurant` + permission), mais on
   * ne monte la requête QUE si le panneau est ouvert : sur un écran consulté
   * quelques secondes par service, charger en permanence coûterait de
   * l'egress pour rien (§3 — mesurer avant d'ajouter du trafic).
   */
  const { data, isLoading } = useKitchenProduction(
    open ? barId : undefined,
    start,
    end
  );

  return (
    <section className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted"
      >
        <span className="min-w-0 text-body-sm font-medium text-foreground">
          Mon activité
          {/* ⚠️ La période est rappelée SUR LE BOUTON une fois ouvert : sans
              elle, « 3 perdus » ne veut rien dire — 3 aujourd'hui et 3 sur le
              mois n'appellent pas la même réaction. */}
          {open && (
            <span className="ml-2 font-normal text-caption text-muted-foreground">
              · {currentPeriod.label}
            </span>
          )}
        </span>
        <span className="flex flex-shrink-0 items-center gap-2 text-caption text-muted-foreground">
          {open ? 'Masquer' : 'Voir'}
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {/* ⭐ Le bandeau de période partagé — identique à l'Historique et à
              la Comptabilité. Le cuisinier retrouve le geste qu'il connaît. */}
          <PeriodFilter
            timeRange={timeRange}
            setTimeRange={setTimeRange}
            availableFilters={KITCHEN_RANGES}
            customRange={customRange}
            updateCustomRange={updateCustomRange}
          />

          {isLoading && (
            <p className="py-6 text-center text-caption text-muted-foreground">
              Chargement de votre activité…
            </p>
          )}

          {!isLoading && data && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat
                  label="Servis"
                  value={data.served_count}
                  hint="plats livrés"
                  icon={<CheckCircle2 size={12} />}
                  tone={data.served_count > 0 ? 'good' : 'neutral'}
                />
                {/* ⭐⭐ LA CARTE QUI JUSTIFIE L'ÉCRAN.
                    ⭐ Le total ADDITIONNE plats et portions de lot — c'est la
                    matière perdue, toutes causes confondues. Mais le détail
                    reste lisible en dessous : les deux n'appellent pas le même
                    geste (revoir la commande vs produire moins).
                    ⚠️ AUCUN MONTANT : le cuisinier voit les quantités (§8). */}
                <Stat
                  label="Perdus"
                  value={data.loss_count + (data.batch_loss_count ?? 0)}
                  hint={
                    (data.batch_loss_count ?? 0) > 0
                      ? `dont ${data.batch_loss_count} de lot`
                      : 'jetés après cuisson'
                  }
                  icon={<AlertTriangle size={12} />}
                  tone={
                    data.loss_count + (data.batch_loss_count ?? 0) > 0
                      ? 'warn'
                      : 'neutral'
                  }
                />
                <Stat
                  label="À préparer"
                  value={data.todo_count}
                  hint="en attente"
                  icon={<Flame size={12} />}
                />
                <Stat
                  label="Préparation"
                  /* ⚠️ « — » et JAMAIS « 0 min » quand aucun plat n'a atteint
                     `ready` : « 0 min » se lirait comme une cuisson
                     instantanée. Même règle que partout dans le module. */
                  value={data.avg_prep_min != null ? `${data.avg_prep_min} min` : '—'}
                  hint="commande → prêt"
                  icon={<Clock size={12} />}
                />
              </div>

              {/* ⭐ PLATS PRÊTS EN ATTENTE — jamais additionnés aux pertes :
                  ils ont coûté leur matière mais sont ENCORE servables. C'est
                  un signal d'action, pas un constat. */}
              {data.pending_count > 0 && (
                <p className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-caption text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                  <strong>{data.pending_count} plat(s)</strong> prêt(s) attendent
                  d’être servis - ils refroidissent.
                </p>
              )}

              {/* Détail par plat - trié pertes d'abord (côté RPC). */}
              {data.dishes.length > 0 ? (
                <div className="rounded-xl border border-border bg-card p-3">
                  <h5 className="mb-2 text-micro uppercase tracking-wide text-muted-foreground">
                    Par plat
                  </h5>
                  <div className="space-y-2">
                    {data.dishes.map((d) => (
                      <div
                        key={d.dish_id}
                        className="flex items-center justify-between gap-2 py-0.5"
                      >
                        <span className="min-w-0 truncate text-body-sm text-foreground/80">
                          {d.dish_name}
                        </span>
                        <span className="flex-shrink-0 text-caption tabular-nums text-muted-foreground">
                          {d.served_count} servi{d.served_count > 1 ? 's' : ''}
                          {d.loss_count > 0 && (
                            <span className="font-semibold text-amber-700 dark:text-amber-400">
                              {' '}
                              · {d.loss_count} perdu{d.loss_count > 1 ? 's' : ''}
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                /* ⚠️ Un message EXPLICITE, jamais un panneau vide : le
                   cuisinier doit pouvoir distinguer « rien fait » d'un
                   défaut de chargement. */
                <p className="py-6 text-center text-caption text-muted-foreground">
                  Aucun plat sur cette période.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

KitchenProductionPanel.displayName = 'KitchenProductionPanel';
