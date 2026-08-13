/**
 * ShortfallWarning
 * Ce qui manquera, dit AVANT le geste (§4.4).
 *
 * ⭐⭐ AVERTIR N'EST PAS BLOQUER.
 * Le serveur ne refuse jamais sur un ingrédient manquant : « le cuisinier voit
 * ce qu'il a, un stock théorique à 0 ne doit pas empêcher un plat de sortir »
 * (§4.4). Il enregistre une DETTE, pas un stock négatif. Ce bandeau rend
 * l'écart visible avant l'action — il ne la contredit pas.
 *
 * ⚠️ AUCUN MONTANT (§8). Le cuisinier voit des QUANTITÉS. Afficher la valeur de
 * ce qui manque le mettrait devant un chiffre d'argent que son rôle exclut, et
 * ce composant s'affiche d'abord pour lui.
 *
 * ⚠️ Ton FACTUEL, jamais accusateur : un stock à zéro n'est pas une faute du
 * cuisinier. C'est souvent l'appro qui n'a pas été saisi.
 */

import { AlertTriangle } from 'lucide-react';
import type { IngredientShortfall } from '../../hooks/useRecipeShortfall';

interface Props {
  shortfalls: IngredientShortfall[];
  /**
   * ⚠️ Passé explicitement : pendant le chargement, une liste vide se lit comme
   * « rien ne manque ». Le piège s'est déjà produit trois fois sur ce module —
   * une donnée non encore arrivée prise pour une donnée absente.
   */
  isLoading?: boolean;
}

/**
 * Arrondi d'affichage — 3 décimales max, sans zéros inutiles.
 * ⚠️ `NUMERIC(14,3)` côté base : au-delà de 3 décimales on afficherait une
 * précision que la table ne stocke pas.
 */
function formatQty(value: number): string {
  return Number(value.toFixed(3)).toString();
}

export function ShortfallWarning({ shortfalls, isLoading = false }: Props) {
  // ⛔ Silencieux pendant le chargement : ne rien affirmer avant de savoir.
  if (isLoading || shortfalls.length === 0) return null;

  return (
    <div
      role="status"
      className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30"
    >
      <p className="flex items-center gap-1.5 text-body-sm font-medium text-amber-900 dark:text-amber-200">
        <AlertTriangle size={16} className="flex-shrink-0" />
        Stock insuffisant
      </p>

      <ul className="mt-2 space-y-1">
        {shortfalls.map((s) => (
          <li
            key={s.ingredientId}
            className="flex items-baseline justify-between gap-2 text-caption text-amber-900 dark:text-amber-200"
          >
            <span className="min-w-0 truncate">{s.name}</span>
            {/* ⭐ CE QU'IL RESTE, puis CE QU'IL MANQUE : le cuisinier peut
                décider (réduire la quantité, ou lancer quand même). Afficher
                le seul manque l'obligerait à faire l'addition. */}
            <span className="flex-shrink-0 tabular-nums">
              reste {formatQty(s.available)} {s.unit} · manque{' '}
              <strong className="font-semibold">
                {formatQty(s.missing)} {s.unit}
              </strong>
            </span>
          </li>
        ))}
      </ul>

      {/* ⚠️ Dire ce qui se passera SI on continue. Sans cette phrase, le
          bandeau ressemble à un blocage et le cuisinier cherche un bouton qui
          n'existe pas. */}
      <p className="mt-2 text-caption text-amber-800 dark:text-amber-300">
        Vous pouvez continuer : le manque sera enregistré et à régulariser
        lors du prochain approvisionnement.
      </p>
    </div>
  );
}

ShortfallWarning.displayName = 'ShortfallWarning';
