import { describe, it, expect } from 'vitest';
import {
  computeSubscriptionStatus,
  computeNextDueDate,
  monthsOverdue,
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

    it('EMPILE depuis l\'échéance courante même dépassée (pas de temps gratuit)', () => {
      // NOW = 7 juin. Échéance dépassée au 1er mai + 1 mois = 1er juin (empilement),
      // et NON juillet (l'ancien comportement repartait de now).
      const r = computeNextDueDate('2026-05-01T00:00:00Z', 1, NOW);
      expect(r.getMonth()).toBe(5); // juin (index 5)
      expect(r.getDate()).toBe(1);
    });

    it('repart de l\'échéance courante quand elle est dans le futur (paiement anticipé)', () => {
      const r = computeNextDueDate('2026-09-01T00:00:00Z', 3, NOW);
      // base = septembre + 3 mois = décembre
      expect(r.getMonth()).toBe(11);
    });
  });

  describe('monthsOverdue', () => {
    it('retourne 0 quand pas d\'échéance', () => {
      expect(monthsOverdue(undefined, NOW)).toBe(0);
    });

    it('retourne 0 quand l\'échéance est future', () => {
      expect(monthsOverdue('2026-09-01T00:00:00Z', NOW)).toBe(0);
    });

    it('retourne 0 pour une échéance aujourd\'hui', () => {
      // Même jour calendaire UTC que NOW (2026-06-07) → pas de retard.
      expect(monthsOverdue('2026-06-07T00:00:00Z', NOW)).toBe(0);
    });

    it('retourne 1 pour un retard de quelques jours (mois entamé)', () => {
      // NOW = 7 juin, échéance 1er juin → 6 jours de retard → 1 mois dû
      expect(monthsOverdue('2026-06-01T00:00:00Z', NOW)).toBe(1);
    });

    it('arrondit au mois supérieur : 2 mois pleins + reste = 3 mois', () => {
      // échéance 1er mars, now 20 mai → 2 mois entiers (mars, avril) + 19j → 3
      const d = new Date('2026-05-20T12:00:00Z');
      expect(monthsOverdue('2026-03-01T00:00:00Z', d)).toBe(3);
    });

    it('retourne exactement N pour un multiple exact de mois', () => {
      // échéance 1er mars, now 1er juin → 3 mois pleins pile → 3
      const d = new Date('2026-06-01T12:00:00Z');
      expect(monthsOverdue('2026-03-01T00:00:00Z', d)).toBe(3);
    });

    // ⚠️ Cas FIN DE MOIS — révélés par la certification (clamping Postgres).
    // JS Date.setMonth déborde (31 jan + 1 mois = 3 mars) ; Postgres clampe (28 fév).
    // La fonction DOIT suivre Postgres (source de vérité du garde-fou serveur).
    it('échéance au 31 : clampe la fin de mois comme Postgres (pas de débordement)', () => {
      // due=31 jan, now=1er mars → 31 jan + 1 mois = 28 fév (clampé) < 1er mars
      // → 1 mois entier + reste → 2 mois. (Le débordement JS donnait 1 à tort.)
      expect(monthsOverdue('2026-01-31T00:00:00Z', new Date('2026-03-01T12:00:00Z'))).toBe(2);
    });

    it('échéance au 31, now au 28 fév : exactement 1 mois (clampé pile)', () => {
      // 31 jan + 1 mois = 28 fév = now → 1 mois pile, pas de reste → 1
      expect(monthsOverdue('2026-01-31T00:00:00Z', new Date('2026-02-28T12:00:00Z'))).toBe(1);
    });

    it('échéance au 30 : clampe correctement sur les mois courts', () => {
      // due=30 avril, now=1er juin → 30 avr + 1 mois = 30 mai < 1er juin → 2
      expect(monthsOverdue('2026-04-30T00:00:00Z', new Date('2026-06-01T12:00:00Z'))).toBe(2);
    });

    it('échéance proche de minuit UTC : calcul en UTC (pas de bascule locale)', () => {
      // due=2026-04-01T23:30Z (00:30 locale Bénin). En UTC le jour reste le 1er avril.
      // now=2026-07-02 → 3 mois entiers (1 avr→1 juil) + 1j → 4 mois.
      expect(monthsOverdue('2026-04-01T23:30:00Z', new Date('2026-07-02T07:00:00Z'))).toBe(4);
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
