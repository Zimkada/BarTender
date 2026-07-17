import { describe, it, expect } from 'vitest';
import {
  computeSubscriptionStatus,
  computeNextDueDate,
  addMonths,
  subscriptionStatusSortWeight,
  SUBSCRIPTION_STATUS_LABELS,
  DUE_SOON_THRESHOLD_DAYS,
} from './subscriptionHelpers';

const NOW = new Date('2026-06-07T12:00:00Z');

describe('subscriptionHelpers', () => {
  describe('computeSubscriptionStatus', () => {
    it('retourne never_paid quand pas de date', () => {
      const r = computeSubscriptionStatus(undefined, NOW);
      expect(r.status).toBe('never_paid');
      expect(r.daysUntilDue).toBeNull();
    });

    it('retourne never_paid pour une date invalide', () => {
      expect(computeSubscriptionStatus('pas-une-date', NOW).status).toBe('never_paid');
    });

    it('retourne overdue quand l\'échéance est dépassée (hier)', () => {
      const r = computeSubscriptionStatus('2026-06-06T12:00:00Z', NOW);
      expect(r.status).toBe('overdue');
      expect(r.daysUntilDue).toBe(-1);
    });

    it('retourne due_soon quand l\'échéance est dans 3 jours', () => {
      const r = computeSubscriptionStatus('2026-06-10T12:00:00Z', NOW);
      expect(r.status).toBe('due_soon');
      expect(r.daysUntilDue).toBe(3);
    });

    it('traite le jour pile du seuil comme due_soon', () => {
      const due = new Date('2026-06-07T12:00:00Z');
      due.setDate(due.getDate() + DUE_SOON_THRESHOLD_DAYS);
      expect(computeSubscriptionStatus(due.toISOString(), NOW).status).toBe('due_soon');
    });

    it('retourne up_to_date quand l\'échéance est dans 20 jours', () => {
      const r = computeSubscriptionStatus('2026-06-27T12:00:00Z', NOW);
      expect(r.status).toBe('up_to_date');
      expect(r.daysUntilDue).toBe(20);
    });

    it('traite l\'échéance du jour même comme due_soon (0 jour)', () => {
      // Même jour calendaire local que NOW, heure plus tardive
      const sameDay = new Date(NOW);
      sameDay.setHours(23, 0, 0, 0);
      const r = computeSubscriptionStatus(sameDay.toISOString(), NOW);
      expect(r.status).toBe('due_soon');
      expect(r.daysUntilDue).toBe(0);
    });
  });

  describe('addMonths', () => {
    it('ajoute des mois simples', () => {
      expect(addMonths(new Date('2026-01-15T00:00:00Z'), 3).getMonth()).toBe(3); // avril
    });

    it('gère le passage d\'année', () => {
      const r = addMonths(new Date('2026-11-10T00:00:00Z'), 3);
      expect(r.getFullYear()).toBe(2027);
      expect(r.getMonth()).toBe(1); // février
    });
  });

  describe('computeNextDueDate', () => {
    it('repart de now quand pas d\'échéance courante', () => {
      const r = computeNextDueDate(undefined, 1, NOW);
      expect(r.getMonth()).toBe(NOW.getMonth() + 1);
    });

    it('repart de now quand l\'échéance courante est dépassée', () => {
      const r = computeNextDueDate('2026-05-01T00:00:00Z', 1, NOW);
      // base = now (juin) + 1 mois = juillet
      expect(r.getMonth()).toBe(6);
    });

    it('repart de l\'échéance courante quand elle est dans le futur (paiement anticipé)', () => {
      const r = computeNextDueDate('2026-09-01T00:00:00Z', 3, NOW);
      // base = septembre + 3 mois = décembre
      expect(r.getMonth()).toBe(11);
    });
  });

  describe('subscriptionStatusSortWeight', () => {
    it('place overdue avant due_soon avant up_to_date', () => {
      expect(subscriptionStatusSortWeight('overdue')).toBeLessThan(
        subscriptionStatusSortWeight('due_soon')
      );
      expect(subscriptionStatusSortWeight('due_soon')).toBeLessThan(
        subscriptionStatusSortWeight('up_to_date')
      );
    });

    it('place trial entre never_paid et up_to_date, exempt en dernier (aligné sur le RPC)', () => {
      expect(subscriptionStatusSortWeight('never_paid')).toBeLessThan(
        subscriptionStatusSortWeight('trial')
      );
      expect(subscriptionStatusSortWeight('trial')).toBeLessThan(
        subscriptionStatusSortWeight('up_to_date')
      );
      expect(subscriptionStatusSortWeight('exempt')).toBeGreaterThan(
        subscriptionStatusSortWeight('up_to_date')
      );
    });
  });

  describe('SUBSCRIPTION_STATUS_LABELS', () => {
    it('fournit un libellé FR pour chacun des 6 statuts', () => {
      expect(SUBSCRIPTION_STATUS_LABELS.trial).toBe('Essai gratuit');
      expect(SUBSCRIPTION_STATUS_LABELS.exempt).toBe('Exempté');
      // Aucun libellé manquant (le type garantit les clés, on vérifie les valeurs)
      Object.values(SUBSCRIPTION_STATUS_LABELS).forEach((label) => {
        expect(label.length).toBeGreaterThan(0);
      });
    });
  });
});
