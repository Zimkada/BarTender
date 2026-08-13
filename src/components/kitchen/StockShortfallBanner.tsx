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
 * ⭐⭐ DEUX MANQUES DISTINCTS, JAMAIS FUSIONNÉS (ajout du 08/08/2026) :
 *   · un INGRÉDIENT manquant n'empêche rien — le service crée une dette ;
 *   · un LOT manquant fera REFUSER le démarrage (§16.9), parce qu'une
 *     alternative existe : cuisiner à la commande.
 * Le geste de réparation diffère aussi — approvisionner d'un côté, PRODUIRE de
 * l'autre. Une liste unique laisserait le cuisinier sans action claire.
 *
 * ⛔ POUR LES INGRÉDIENTS, IL N'EMPÊCHE RIEN. C'est un avertissement.
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
   * ⚠️ `?? []` indispensable : la clé n'existe que depuis la migration
   * 20260808180000. Entre le déploiement du code et l'exécution du SQL, elle
   * est absente — et `undefined.length` planterait l'écran Service.
   */
  const batchShortfalls = data?.batch_shortfalls ?? [];

  /**
   * ⛔ SILENCIEUX PENDANT LE CHARGEMENT. Une liste vide non encore chargée se
   * lit comme « rien ne manque » — le piège s'est déjà produit trois fois sur
   * ce module (alertes de lot, Set des plats, tableau de lots).
   */
  if (isLoading || (shortfalls.length === 0 && batchShortfalls.length === 0)) {
    return null;
  }

  return (
    <div
      role="status"
      className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30"
    >
      {/* ⭐⭐ LES LOTS D'ABORD, et ce n'est pas un détail d'ordre : un
          ingrédient manquant laisse passer le plat (dette, §4.4), un LOT
          manquant le fera REFUSER au démarrage (§16.9). L'information la plus
          bloquante se lit en premier. */}
      {batchShortfalls.length > 0 && (
        <>
          <p className="flex items-center gap-1.5 text-body-sm font-medium text-amber-900 dark:text-amber-200">
            <AlertTriangle size={16} className="flex-shrink-0" />
            Lots insuffisants pour les plats en attente
          </p>

          <ul className="mt-2 space-y-1">
            {batchShortfalls.map((b) => (
              <li
                key={b.base_dish_id}
                className="flex items-baseline justify-between gap-2 text-caption text-amber-900 dark:text-amber-200"
              >
                <span className="min-w-0 truncate">{b.name}</span>
                <span className="flex-shrink-0 tabular-nums">
                  reste {formatQty(b.available)} · manque{' '}
                  <strong className="font-semibold">{formatQty(b.missing)}</strong>{' '}
                  portion{b.missing > 1 ? 's' : ''}
                </span>
              </li>
            ))}
          </ul>

          {/* ⚠️ Ton DIFFÉRENT de celui des ingrédients : ici le démarrage sera
              REFUSÉ. Annoncer « vous pouvez préparer » serait faux. */}
          <p className="mt-2 text-caption text-amber-800 dark:text-amber-300">
            Produisez un lot avant de lancer ces plats, ou préparez-les à la
            commande.
          </p>
        </>
      )}

      {/* ⚠️ Séparateur seulement si les DEUX listes sont présentes. */}
      {batchShortfalls.length > 0 && shortfalls.length > 0 && (
        <hr className="my-3 border-amber-200 dark:border-amber-900" />
      )}

      {shortfalls.length > 0 && (
        <>
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
        </>
      )}
    </div>
  );
}

StockShortfallBanner.displayName = 'StockShortfallBanner';
