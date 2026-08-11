/**
 * SizeReconciliationPanel — rapprochement reçus ↔ vendus par taille (§19.6).
 *
 * ⭐ LE CONTRÔLE QUE LE RESTAURATEUR FAIT DÉJÀ AU CAHIER : « ce carton avait
 * 12 grands, j'en ai vendu 11, il m'en reste un ». Un écart NÉGATIF - vendus
 * supérieurs aux reçus - est le signal qui compte : erreur de tri, ou serveur
 * qui facture du grand en servant du moyen.
 *
 * ⛔⛔ CET ÉCRAN NE PROUVE RIEN À LUI SEUL, et il doit le dire.
 *
 * Le rapprochement se fait PAR PÉRIODE, pas par carton : un carton reçu la
 * veille et vendu le lendemain apparaît dans deux périodes différentes. Sur
 * une période courte, les deux colonnes peuvent donc diverger sans anomalie
 * réelle. D'où « sur la période » partout, et JAMAIS « il manque X ».
 *
 * ⚠️ Un écart n'est pas une accusation : c'est une question à poser.
 */

import { memo } from 'react';
import { Scale, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '../../lib/utils';
import { EmptyState } from '../common/EmptyState';
import type { SizeReconciliationRow } from '../../services/supabase/ingredients.service';

interface Props {
  rows: SizeReconciliationRow[];
  isLoading: boolean;
  periodLabel: string;
}

/** ⚠️ 3 décimales max : au-delà on afficherait une précision non stockée. */
function formatQty(v: number): string {
  return Number(v.toFixed(3)).toString();
}

export const SizeReconciliationPanel = memo(function SizeReconciliationPanel({
  rows,
  isLoading,
  periodLabel,
}: Props) {
  if (isLoading) {
    return (
      <p className="py-10 text-center text-caption text-muted-foreground">
        Calcul en cours…
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Scale}
        message="Aucun mouvement sur la période"
        subMessage="Déclarez les tailles d'un ingrédient, comptez vos livraisons, puis associez vos formats de plat pour voir ce contrôle."
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-caption text-muted-foreground">
        Ce que vous avez reçu et ce que vous avez vendu, {periodLabel}.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-caption text-muted-foreground">
              <th className="pb-2 pr-3 font-medium">Taille</th>
              <th className="pb-2 px-3 text-right font-medium">Reçus</th>
              <th className="pb-2 px-3 text-right font-medium">Vendus</th>
              <th className="pb-2 pl-3 text-right font-medium">Écart</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              /**
               * ⭐ SEUL L'ÉCART NÉGATIF EST UNE ANOMALIE.
               *
               * Positif = il reste des unités, ce qui est le cas NORMAL en
               * cours de carton. Le colorer en rouge ferait crier au loup à
               * chaque livraison et le gérant cesserait de regarder l'écran.
               */
              const isAnomaly = row.gap < 0;

              return (
                <tr key={row.size_id} className="border-b border-border/50">
                  <td className="py-2.5 pr-3">
                    <span className="font-medium">{row.size_label}</span>
                    <span className="block text-caption text-muted-foreground">
                      {row.ingredient_name}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums">
                    {formatQty(row.received)}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums">
                    {formatQty(row.sold)}
                  </td>
                  <td
                    className={cn(
                      'py-2.5 pl-3 text-right font-semibold tabular-nums',
                      isAnomaly
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-muted-foreground'
                    )}
                  >
                    <span className="inline-flex items-center gap-1">
                      {isAnomaly ? (
                        <TrendingDown size={14} />
                      ) : row.gap > 0 ? (
                        <TrendingUp size={14} className="opacity-40" />
                      ) : null}
                      {row.gap > 0 ? `+${formatQty(row.gap)}` : formatQty(row.gap)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/*
        ⚠️ CE BLOC N'EST PAS DÉCORATIF. Sans lui, un écart négatif se lit comme
        une preuve de vol - alors qu'il a des causes bien plus banales. Un
        chiffre de contrôle qu'on ne sait pas interpréter finit par accuser
        quelqu'un à tort, ou par être ignoré.
      */}
      {rows.some((r) => r.gap < 0) && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-caption text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <p className="font-medium">Vendus plus que reçus sur cette période</p>
          <p className="mt-1">
            Trois causes possibles, dans cet ordre de fréquence : un carton reçu
            avant la période et vendu pendant ; une erreur de comptage à la
            réception ; un format facturé qui ne correspond pas à ce qui a été
            servi.
          </p>
          <p className="mt-1">
            Élargissez la période avant de conclure : le rapprochement compare
            des totaux, pas carton par carton.
          </p>
        </div>
      )}
    </div>
  );
});

SizeReconciliationPanel.displayName = 'SizeReconciliationPanel';
