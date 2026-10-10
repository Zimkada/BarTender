/**
 * Libellé du moment « vente validée » (audit UI/UX, lot 2, 10/10/2026).
 * Séparé du composant : un fichier qui exporte composant ET fonctions casse le
 * rechargement à chaud (react-refresh/only-export-components).
 *
 * ⛔ Le libellé dit EXACTEMENT ce qui s'est passé, jamais plus (cf.
 * SaleSuccessOverlay.tsx).
 */

export interface SaleSuccess {
  title: string;
  details: string[];
  amount?: number;
}

export interface SaleSuccessContext {
  /** Le vendeur a-t-il `canValidateSales` ? Sinon la vente naît `pending`. */
  canValidate: boolean;
  hasDrinks: boolean;
  hasKitchen: boolean;
  /** Bon CHOISI par l'utilisateur (pas le bon implicite créé pour la cuisine). */
  hasTicket: boolean;
  ticketNumber?: number | null;
  isOffline: boolean;
  amount: number;
}

export function buildSaleSuccess(ctx: SaleSuccessContext): SaleSuccess {
  // Plats seuls : rien n'est vendu à ce stade, la vente naît au service (§6).
  if (!ctx.hasDrinks && ctx.hasKitchen) {
    return { title: 'Commande envoyée en cuisine', details: [], amount: ctx.amount };
  }

  const title = ctx.hasTicket
    ? `Ajouté au bon${ctx.ticketNumber ? ` #${ctx.ticketNumber}` : ''}`
    : ctx.canValidate
      ? 'Vente encaissée'
      : 'Vente envoyée';

  const details: string[] = [];
  if (ctx.hasTicket) details.push('Réglé à la clôture du bon');
  if (!ctx.canValidate) details.push('En attente de validation du gérant');
  if (ctx.hasKitchen) details.push('Plats envoyés en cuisine');
  if (ctx.isOffline) details.push('Hors ligne : envoyée au retour du réseau');

  return { title, details, amount: ctx.amount };
}
