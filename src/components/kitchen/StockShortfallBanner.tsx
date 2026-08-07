/**
 * StockShortfallBanner
 * Ce qui manquera pour la file en cours - annoncé AVANT le geste (§4.4).
 *
 * ⭐⭐ POURQUOI CE BANDEAU EXISTE
 * Le serveur ne BLOQUE JAMAIS sur un ingrédient manquant : il enregistre une
 * DETTE (§4.4 - « en cuisine réelle, le cuisinier voit ce qu'il a »). La
 * préparation réussit donc, et l'anomalie n'apparaît que dans un écran que le
 * cuisinier n'ouvre pas. Ce bandeau rend l'écart visible pendant le service.
 *
 * ⛔ IL N'EMPÊCHE RIEN, et ne doit jamais le faire. C'est un avertissement.
 *
 * ⚠️ AUCUN MONTANT (§8) : la RPC n'en renvoie aucun, et ce bandeau s'affiche
 * d'abord pour le cuisinier, dont le rôle exclut les chiffres d'argent.
 *
 * ⚠️ UNE SEULE REQUÊTE pour toute la file - c'est la raison d'être de la RPC
 * `get_kitchen_queue_shortfalls`. Charger les recettes une par une aurait fait
 * autant de requêtes que de plats en file (§3, egress).
 */

import { AlertTriangle } from 'lucide-react';
import { useQueueShortfalls } from '../../hooks/queries/useKitchenQueries';

interface Props {
  barId: string | undefined;
}

/**
 * ⚠️ 3 décimales max : `NUMERIC(14,3)` en base. Afficher au-delà donnerait une
 * précision que la table ne stocke pas.
 */
function formatQty(value: number): string {
  return Number(value.toFixed(3)).toString();
}

export function StockShortfallBanner({ barId }: Props) {
  const { data, isLoading } = useQueueShortfalls(barId);

  const shortfalls = data?.shortfalls ?? [];

  /**
   * ⛔ SILENCIEUX PENDANT LE CHARGEMENT. Une liste vide non encore chargée se
   * lit comme « rien ne manque » — le piège s'est déjà produit trois fois sur
   * ce module (alertes de lot, Set des plats, tableau de lots).
   *
   * ⚠️ `data?.success === false` couvre aussi le refus d'accès : mieux vaut ne
   * rien dire qu'afficher une alerte vide.
   */
  if (isLoading || shortfalls.length === 0) return null;

  return (
    <div
      role="status"
      className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30"
    >
      <p className="flex items-center gap-1.5 text-body-sm font-medium text-amber-900 dark:text-amber-200">
        <AlertTriangle size={16} className="flex-shrink-0" />
        Stock insuffisant pour les plats en attente
      </p>

      <ul className="mt-2 space-y-1">
        {shortfalls.map((s) => (
          <li
            key={s.ingredient_id}
            className="flex items-baseline justify-between gap-2 text-caption text-amber-900 dark:text-amber-200"
          >
            <span className="min-w-0 truncate">{s.name}</span>
            {/* ⭐ RESTE puis MANQUE : le cuisinier doit pouvoir décider
                (réduire, remplacer, ou lancer quand même). Le seul manque
                l'obligerait à faire l'addition de tête, en plein service. */}
            <span className="flex-shrink-0 tabular-nums">
              reste {formatQty(s.available)} {s.unit} · manque{' '}
              <strong className="font-semibold">
                {formatQty(s.missing)} {s.unit}
              </strong>
            </span>
          </li>
        ))}
      </ul>

      {/* ⚠️ Dire ce qui se passera si on continue. Sans cette phrase, le
          bandeau ressemble à un blocage et le cuisinier cherche une
          autorisation qui n'existe pas. */}
      <p className="mt-2 text-caption text-amber-800 dark:text-amber-300">
        Vous pouvez préparer : le manque sera enregistré et à régulariser au
        prochain approvisionnement.
      </p>
    </div>
  );
}

StockShortfallBanner.displayName = 'StockShortfallBanner';
