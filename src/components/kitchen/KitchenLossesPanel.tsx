/**
 * KitchenLossesPanel
 * Le journal des pertes cuisine - total en tête, détail en dessous.
 *
 * ⭐⭐ CE QUE CET ÉCRAN APPORTE
 * Neuf migrations du 09/08/2026 ont rendu les pertes DÉCLARABLES : quantité,
 * motif, auteur. Rien ne les affichait. Le promoteur voyait deux totaux sur le
 * tableau de bord sans pouvoir savoir ce qu'ils recouvraient.
 *
 * ⭐ TROIS SOURCES, JAMAIS FUSIONNÉES : le geste correctif diffère.
 *   · plat annulé  → erreur de commande      → revoir la prise de commande ;
 *   · lot jeté     → sur-production          → ajuster le volume ;
 *   · ingrédient   → achat ou conservation   → ajuster l'appro.
 * Les additionner masquerait lequel corriger.
 *
 * ⛔⛔ LE CUISINIER VOIT CE JOURNAL, arbitrage de l'exploitant : « il est
 * responsable des stocks ». Mais PAS LES MONTANTS (§8) - il voit les
 * quantités, comme partout ailleurs dans le module.
 * ⚠️ Le masquage est APPLICATIF : la RPC retourne les montants. Chaque endroit
 * qui affiche une valeur doit donc porter sa garde `canViewCosts`.
 */

import { useMemo } from 'react';
import { AlertTriangle, ChefHat, CookingPot, Carrot, User } from 'lucide-react';
import { useKitchenLosses } from '../../hooks/queries/useKitchenQueries';
import { useAuth } from '../../context/AuthContext';
import { useCurrencyFormatter } from '../../hooks/useBeninCurrency';
import { EmptyState } from '../common/EmptyState';
import { cn } from '../../lib/utils';
import type { KitchenLossLine } from '../../services/supabase/kitchen.service';

interface Props {
  barId: string | undefined;
  /** Bornes de la période, au format `YYYY-MM-DD`. */
  startDate?: string;
  endDate?: string;
}

/**
 * ⭐ Chaque source a son icône ET son libellé : sur un journal mêlé, la
 * couleur seule ne suffit pas à distinguer trois origines.
 */
const SOURCES = {
  dish: { label: 'Plat annulé', Icon: ChefHat },
  batch: { label: 'Lot jeté', Icon: CookingPot },
  ingredient: { label: 'Ingrédient', Icon: Carrot },
} as const;

/**
 * Traduit un motif technique en langage clair.
 *
 * ⚠️ Les motifs viennent de DEUX vocabulaires : les statuts de lot
 * (`expired`, `discarded`) et les causes d'annulation de plat
 * (`out_of_stock`…). Un libellé absent est affiché TEL QUEL plutôt que masqué :
 * un motif inconnu reste une information.
 */
const MOTIFS: Record<string, string> = {
  expired: 'Périmé',
  discarded: 'Invendu',
  spoiled: 'Abîmé',
  damaged: 'Casse',
  out_of_stock: 'Rupture',
  kitchen_error: 'Erreur cuisine',
  server_input_error: 'Erreur de saisie',
  customer_cancelled: 'Client parti',
  substitution_offered: 'Remplacé',
  inventory_correction: 'Correction d’inventaire',
};

/** ⚠️ 3 décimales max : au-delà on afficherait une précision non stockée. */
function formatQty(v: number): string {
  return Number(v.toFixed(3)).toString();
}

function formatMoment(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function KitchenLossesPanel({ barId, startDate, endDate }: Props) {
  const { data, isLoading } = useKitchenLosses(barId, startDate, endDate);
  const { hasPermission } = useAuth();
  const { formatPrice } = useCurrencyFormatter();

  /** ⭐ §8 — le cuisinier voit les quantités, jamais les montants. */
  const canViewCosts = hasPermission('canViewKitchenCosts');

  const lines: KitchenLossLine[] = useMemo(() => data?.lines ?? [], [data]);

  if (isLoading) {
    return (
      <p className="py-10 text-center text-caption text-muted-foreground">
        Chargement des pertes…
      </p>
    );
  }

  if (lines.length === 0) {
    return (
      <EmptyState
        icon={AlertTriangle}
        message="Aucune perte sur cette période"
        subMessage="Les plats annulés, lots jetés et ingrédients perdus apparaîtront ici."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* ⭐ LE TOTAL EN TÊTE, puis sa ventilation. On répond d'abord à
          « combien », ensuite à « sur quoi ». */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
        <p className="text-caption text-amber-800 dark:text-amber-300">
          {data?.total_count} perte{(data?.total_count ?? 0) > 1 ? 's' : ''} sur la
          période
        </p>

        {/* ⚠️ Le MONTANT total n'apparaît que pour qui peut le voir. Le
            cuisinier lit le NOMBRE, qui reste une information utile. */}
        {canViewCosts && (
          <p className="mt-0.5 text-h2 font-semibold tabular-nums text-amber-900 dark:text-amber-200">
            {formatPrice(data?.total_value ?? 0)}
          </p>
        )}

        {canViewCosts && data?.by_source && (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-amber-200/60 pt-2 text-caption text-amber-800 dark:border-amber-800/60 dark:text-amber-300">
            {/* ⛔ Les trois restent SÉPARÉES : chacune appelle un geste
                correctif différent. */}
            {(Object.keys(SOURCES) as Array<keyof typeof SOURCES>).map((key) => {
              const value = data.by_source[key] ?? 0;
              if (value <= 0) return null;
              return (
                <span key={key} className="tabular-nums">
                  {SOURCES[key].label} · {formatPrice(value)}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* ⭐ LE JOURNAL — le plus récent d'abord, ordre donné par la RPC. */}
      <ul className="space-y-2">
        {lines.map((line, i) => {
          const source = SOURCES[line.source];
          const Icon = source?.Icon ?? AlertTriangle;

          return (
            <li
              /**
               * ⚠️ Index dans la clé : une même ligne peut se répéter à
               * l'identique (deux pertes du même lot, même motif, même minute)
               * et la RPC ne retourne pas d'identifiant de ligne.
               */
              key={`${line.source}-${line.occurred_at}-${i}`}
              className="rounded-lg border border-border bg-card p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-body-sm font-medium text-foreground">
                    <Icon size={14} className="flex-shrink-0 text-muted-foreground" />
                    <span className="truncate">{line.item_name}</span>
                  </p>

                  <p className="mt-0.5 text-caption text-muted-foreground">
                    {formatQty(line.qty)} {line.unit}
                    {line.reason && ` · ${MOTIFS[line.reason] ?? line.reason}`}
                  </p>

                  {/* ⭐ L'AUTEUR - c'est ce qui rend le chiffre contrôlable.
                      ⚠️ NULL sur les gestes antérieurs au 09/08 : un auteur ne
                      s'invente pas rétroactivement, et afficher « inconnu »
                      serait plus honnête qu'un nom deviné. */}
                  {line.actor_name && (
                    <p className="mt-0.5 flex items-center gap-1 text-caption text-muted-foreground">
                      <User size={11} className="flex-shrink-0" />
                      {line.actor_name}
                    </p>
                  )}
                </div>

                <div className="flex-shrink-0 text-right">
                  <p className="text-caption text-muted-foreground">
                    {formatMoment(line.occurred_at)}
                  </p>
                  {canViewCosts && (
                    <p
                      className={cn(
                        'mt-0.5 text-body-sm font-medium tabular-nums',
                        'text-amber-700 dark:text-amber-400'
                      )}
                    >
                      {formatPrice(line.value)}
                    </p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

KitchenLossesPanel.displayName = 'KitchenLossesPanel';
