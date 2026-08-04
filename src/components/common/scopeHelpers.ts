/**
 * scopeHelpers
 * Règles de portée Tout / Bar / Restau — §9.
 *
 * ⚠️ Fichier SÉPARÉ de `ScopeSwitcher.tsx` : exporter des fonctions à côté
 * d'un composant casse le Fast Refresh de Vite (« Fast refresh only works when
 * a file only exports components »). Le composant reste dans son fichier, les
 * règles ici.
 *
 * ⭐ SOURCE UNIQUE DE LA RÈGLE. Le Dashboard et l'Historique doivent classer un
 * item de la MÊME façon : sinon leurs chiffres divergeraient pour la même
 * journée, et le promoteur ne saurait pas lequel croire.
 */

export type ActivityScope = 'all' | 'bar' | 'kitchen';

/**
 * Un item de vente appartient-il à la portée demandée ?
 *
 * ⚠️ `item_type ?? 'product'` : les 19 000+ ventes existantes ne portent pas le
 * discriminant. L'absence se lit comme « produit », exactement comme le
 * `COALESCE(item->>'item_type', 'product')` côté SQL — toute autre lecture
 * ferait diverger le client du serveur.
 */
export function itemMatchesScope(
  item: { item_type?: 'product' | 'dish' },
  scope: ActivityScope
): boolean {
  if (scope === 'all') return true;

  /**
   * ⚠️⚠️ LISTE BLANCHE des DEUX côtés — défaut trouvé à la code review.
   *
   * Une première version testait `!== 'dish'` pour la portée Bar (liste
   * noire). Le RPC `get_daily_scope_totals`, lui, teste `= 'product'` (liste
   * blanche). Les deux logiques ne coïncident QUE sur les valeurs connues :
   *
   *   item_type='DISH' →  SQL: exclu du Bar   |  TS: INCLUS dans le Bar
   *   item_type=''     →  SQL: exclu du Bar   |  TS: INCLUS dans le Bar
   *
   * Le Dashboard (SQL) et l'Historique (TS) auraient alors affiché des CA
   * DIFFÉRENTS pour la même journée — et personne n'aurait su lequel croire.
   *
   * ⭐ Même défaut que celui trouvé dans `create_sale_idempotent` le même
   * jour : liste blanche d'un côté, liste noire de l'autre. On teste donc
   * l'appartenance EXPLICITE, comme le SQL.
   */
  const effective = item.item_type ?? 'product';
  return scope === 'kitchen' ? effective === 'dish' : effective === 'product';
}

/**
 * Libellé de portée pour les titres et les messages vides.
 *
 * ⚠️ Centralisé : « Restau » écrit à trois endroits finirait par devenir
 * « Restaurant » à l'un d'eux.
 */
export function scopeLabel(scope: ActivityScope): string {
  if (scope === 'bar') return 'Bar';
  if (scope === 'kitchen') return 'Restau';
  return 'Tout';
}
