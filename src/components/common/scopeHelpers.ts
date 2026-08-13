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
 * CA BRUT d'une portée sur une période, à partir de ventes déjà chargées.
 *
 * ⭐ EXTRAIT DE `AccountingOverview` POUR ÊTRE TESTABLE (09/08/2026) : les
 * trois defauts trouves a la revue de la carte « Dont cuisine » vivaient tous
 * dans cette arithmetique, et rien ne les gardait.
 *
 * ⛔⛔ LES DEUX FILTRES NE SONT PAS REDONDANTS avec les options passees au
 * hook. `useUnifiedSales` FUSIONNE les ventes serveur et les ventes OFFLINE
 * (file IndexedDB) : `startDate` / `endDate` / `status` ne sont transmis qu'a
 * la requete SERVEUR, tandis que le cote offline n'ecarte QUE les doublons de
 * synchronisation. Sans ce refiltrage :
 *
 *   1. PERIODE - une vente offline de juillet encore en file serait comptee
 *      dans « ce mois ». En comptabilite, un chiffre qui deborde sa periode
 *      est un faux.
 *   2. STATUT - une vente en attente de validation gerant (`pending`) serait
 *      comptee comme un CA acquis, alors que l'ecran s'en tient a
 *      `validated`.
 *
 * ⚠️ Le CA est BRUT : ventiler le NET exigerait de repartir les retours, or
 * un remboursement porte sur une VENTE entiere (`returns.sale_id`) et la
 * table ne dit pas quelle part concernait les plats. Meme limite assumee que
 * `get_daily_scope_totals` (04/08).
 */
export function computeScopedGrossRevenue(
  sales: ReadonlyArray<{
    status?: string;
    items?: ReadonlyArray<{ item_type?: 'product' | 'dish'; total_price: number }>;
  }>,
  scope: ActivityScope,
  periodStart: Date,
  periodEnd: Date
): number {
  return sales.reduce((total, sale) => {
    if (sale.status !== 'validated') return total;

    /**
     * ⚠️ DOUBLE CASSE VOLONTAIRE : les ventes offline portent du snake_case
     * (`business_date`), les ventes serveur du camelCase (`businessDate`).
     * Meme lecture que `filteredSales` dans `AccountingOverview` - en lire une
     * seule ferait silencieusement tomber la moitie des ventes hors periode.
     *
     * ⭐ `businessDate` AVANT `createdAt` : une vente de 2h du matin appartient
     * au service de la veille (journee commerciale).
     */
    const saleObj = sale as unknown as Record<string, unknown>;
    const rawDate =
      saleObj.businessDate || saleObj.business_date ||
      saleObj.createdAt || saleObj.created_at;
    if (!rawDate) return total;

    const date = rawDate instanceof Date ? rawDate : new Date(rawDate as string | number);
    if (Number.isNaN(date.getTime())) return total;
    if (date < periodStart || date > periodEnd) return total;

    return (
      total +
      (sale.items ?? []).reduce(
        (sum, item) => (itemMatchesScope(item, scope) ? sum + item.total_price : sum),
        0
      )
    );
  }, 0);
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
