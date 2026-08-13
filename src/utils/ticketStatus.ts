/**
 * ticketStatus.ts — source unique de vérité sur « ce bon est-il terminé ? »
 *
 * Voir PLAN_MODULE_RESTAURATION.md §6.3 et §13.6.
 *
 * ⭐ POURQUOI CE FICHIER
 * `tickets.status` n'a qu'UN axe (`'open' | 'paid'`). Le module restauration en
 * introduit un second : un bon peut être PAYÉ alors que des plats sont encore en
 * cuisine (emporté prépayé, §16.2). `paid` cesse donc de signifier « terminé ».
 *
 * Les 4 combinaisons sont légitimes (§6.3) :
 *
 * | payment | fulfillment | Cas réel                          |
 * |---------|-------------|-----------------------------------|
 * | unpaid  | pending     | service en cours (cas normal)     |
 * | unpaid  | fulfilled   | tout servi, addition à encaisser  |
 * | paid    | pending     | ⭐ emporté payé d'avance          |
 * | paid    | fulfilled   | clos                              |
 *
 * ⛔ INTERDIT AILLEURS : tester `status === 'paid'` pour signifier « terminé ».
 * Utiliser `isTicketClosed()`. Cette règle est instaurée MAINTENANT, alors que
 * l'usage n'existe qu'à un seul endroit — attendre la rendrait inapplicable.
 */

/**
 * Forme minimale acceptée : tout objet portant un statut de paiement et,
 * éventuellement, un statut d'exécution. Compatible `Ticket` (camelCase) comme
 * `TicketRow` (snake_case), sans les coupler à ce module.
 */
export interface TicketClosureState {
  status: 'open' | 'paid';
  /**
   * Absent tant que la migration restauration n'est pas appliquée.
   * `null`/`undefined` ⟹ bar sans cuisine : seul le paiement compte.
   */
  fulfillment_status?: 'pending' | 'fulfilled' | null;
}

/**
 * L'UNIQUE façon de savoir si un bon est terminé.
 *
 * Un bon est clos s'il est payé ET que tout ce qu'il contient a été servi.
 * ⚠️ `fulfillment_status` absent ou `null` ⟹ traité comme rempli : c'est le cas
 * des bars sans cuisine et de toutes les données antérieures à la migration.
 * Sans cette tolérance, tous les bons existants deviendraient « non clos ».
 */
export const isTicketClosed = (ticket: TicketClosureState): boolean =>
  ticket.status === 'paid' &&
  (ticket.fulfillment_status == null || ticket.fulfillment_status === 'fulfilled');

/**
 * Inverse d'`isTicketClosed` — un bon qui demande encore une action.
 *
 * ⭐ C'est le critère des BONS OUVERTS, et il ne se réduit PAS à
 * `status === 'open'` : un bon prépayé dont les plats sont en cuisine reste
 * actif alors qu'il est déjà payé (§13.6). Le filtre serveur de
 * `TicketsService.getOpenTickets` devra devenir
 * `status = 'open' OR fulfillment_status = 'pending'`.
 */
export const isTicketActive = (ticket: TicketClosureState): boolean =>
  !isTicketClosed(ticket);

/**
 * Le bon attend un encaissement (indépendamment de la cuisine).
 * Utile pour distinguer « à encaisser » de « en attente de plats ».
 */
export const isTicketUnpaid = (ticket: TicketClosureState): boolean =>
  ticket.status === 'open';

/**
 * Le bon attend encore des plats, qu'il soit payé ou non.
 *
 * ⚠️ Toujours `false` tant que la migration restauration n'est pas appliquée
 * (`fulfillment_status` inexistant) — donc sans effet sur les bars sans cuisine.
 */
export const isTicketAwaitingKitchen = (ticket: TicketClosureState): boolean =>
  ticket.fulfillment_status === 'pending';
