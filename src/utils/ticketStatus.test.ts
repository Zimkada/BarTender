/**
 * ticketStatus.test.ts
 * Couvre la table de vérité §6.3 du PLAN_MODULE_RESTAURATION.
 *
 * ⭐ Le test décisif est « emporté payé d'avance » : c'est le seul cas où
 * `status === 'paid'` et « terminé » divergent — la raison d'être du helper.
 */

import { describe, it, expect } from 'vitest';
import {
  isTicketClosed,
  isTicketActive,
  isTicketUnpaid,
  isTicketAwaitingKitchen,
  type TicketClosureState,
} from './ticketStatus';

describe('ticketStatus — les deux axes d\'un bon (§6.3)', () => {
  describe('📋 Table de vérité — 4 combinaisons légitimes', () => {
    it('unpaid + pending → service en cours, bon actif', () => {
      // Arrange
      const ticket: TicketClosureState = { status: 'open', fulfillment_status: 'pending' };

      // Act & Assert
      expect(isTicketClosed(ticket)).toBe(false);
      expect(isTicketActive(ticket)).toBe(true);
      expect(isTicketUnpaid(ticket)).toBe(true);
      expect(isTicketAwaitingKitchen(ticket)).toBe(true);
    });

    it('unpaid + fulfilled → tout servi, reste à encaisser', () => {
      const ticket: TicketClosureState = { status: 'open', fulfillment_status: 'fulfilled' };

      expect(isTicketClosed(ticket)).toBe(false);
      expect(isTicketActive(ticket)).toBe(true);
      expect(isTicketUnpaid(ticket)).toBe(true);
      expect(isTicketAwaitingKitchen(ticket)).toBe(false);
    });

    it('⭐ paid + pending → emporté payé d\'avance : PAYÉ mais PAS terminé', () => {
      // ⭐ LE cas qui justifie ce helper. Avant, `status === 'paid'` suffisait à
      // conclure « terminé » — ce bon aurait disparu des bons ouverts alors que
      // la cuisine travaille encore dessus (§13.6).
      const ticket: TicketClosureState = { status: 'paid', fulfillment_status: 'pending' };

      expect(isTicketClosed(ticket)).toBe(false);
      expect(isTicketActive(ticket)).toBe(true);
      expect(isTicketUnpaid(ticket)).toBe(false);
      expect(isTicketAwaitingKitchen(ticket)).toBe(true);
    });

    it('paid + fulfilled → clos', () => {
      const ticket: TicketClosureState = { status: 'paid', fulfillment_status: 'fulfilled' };

      expect(isTicketClosed(ticket)).toBe(true);
      expect(isTicketActive(ticket)).toBe(false);
      expect(isTicketUnpaid(ticket)).toBe(false);
      expect(isTicketAwaitingKitchen(ticket)).toBe(false);
    });
  });

  describe('🔙 Rétrocompatibilité — avant la migration restauration', () => {
    // ⚠️ Ces cas sont ceux de TOUS les bons existants en production aujourd'hui :
    // la colonne fulfillment_status n'existe pas encore.

    it('fulfillment_status absent + paid → clos (bar sans cuisine)', () => {
      const ticket: TicketClosureState = { status: 'paid' };

      expect(isTicketClosed(ticket)).toBe(true);
      expect(isTicketActive(ticket)).toBe(false);
    });

    it('fulfillment_status absent + open → actif', () => {
      const ticket: TicketClosureState = { status: 'open' };

      expect(isTicketClosed(ticket)).toBe(false);
      expect(isTicketActive(ticket)).toBe(true);
    });

    it('fulfillment_status null (colonne nullable) traité comme absent', () => {
      // La migration ajoutera la colonne en NULL sur les lignes existantes :
      // sans cette tolérance, tous les bons payés deviendraient « non clos ».
      expect(isTicketClosed({ status: 'paid', fulfillment_status: null })).toBe(true);
      expect(isTicketClosed({ status: 'open', fulfillment_status: null })).toBe(false);
    });

    it('un bar sans cuisine n\'attend jamais la cuisine', () => {
      expect(isTicketAwaitingKitchen({ status: 'open' })).toBe(false);
      expect(isTicketAwaitingKitchen({ status: 'paid', fulfillment_status: null })).toBe(false);
    });
  });

  describe('⛔ Invariants — ce qui ne doit jamais changer', () => {
    const ALL_COMBINATIONS: TicketClosureState[] = [
      { status: 'open', fulfillment_status: 'pending' },
      { status: 'open', fulfillment_status: 'fulfilled' },
      { status: 'paid', fulfillment_status: 'pending' },
      { status: 'paid', fulfillment_status: 'fulfilled' },
      { status: 'open' },
      { status: 'paid' },
      { status: 'open', fulfillment_status: null },
      { status: 'paid', fulfillment_status: null },
    ];

    it('isTicketActive est exactement la négation d\'isTicketClosed', () => {
      for (const ticket of ALL_COMBINATIONS) {
        expect(
          isTicketActive(ticket),
          `incohérence pour ${JSON.stringify(ticket)}`
        ).toBe(!isTicketClosed(ticket));
      }
    });

    it('un bon non payé n\'est JAMAIS clos', () => {
      const unpaid = ALL_COMBINATIONS.filter((t) => t.status === 'open');

      for (const ticket of unpaid) {
        expect(isTicketClosed(ticket), `${JSON.stringify(ticket)} ne doit pas être clos`).toBe(false);
      }
    });

    it('⭐ « payé » n\'implique PAS « clos »', () => {
      // L'invariant central du §13.6, celui que la V1 supposait à tort.
      const paidButOpen: TicketClosureState = { status: 'paid', fulfillment_status: 'pending' };

      expect(paidButOpen.status).toBe('paid');
      expect(isTicketClosed(paidButOpen)).toBe(false);
    });
  });
});
