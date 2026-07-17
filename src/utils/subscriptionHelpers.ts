// subscriptionHelpers.ts — Calculs purs pour le suivi des abonnements (admin)
// Le statut n'est jamais stocké : il est dérivé de subscriptionDueDate.
//
// ⭐ SOURCE DE VÉRITÉ : la SubscriptionsPage consomme le statut calculé CÔTÉ SERVEUR
// par le RPC get_subscription_overview. computeSubscriptionStatus() est un MIROIR de
// cette logique, conservé pour : tests unitaires, calcul local éventuel, et fallback.
// Il DOIT rester identique au RPC (même seuil due_soon, même règle overdue).
// Si tu modifies un seuil ici, modifie aussi le CASE du RPC, et inversement.
//
// ⚠️ Les statuts 'trial' et 'exempt' NE SONT PAS produits ici : ils dépendent
// respectivement de l'existence d'un paiement enregistré et du flag billing_exempt,
// non dérivables de la seule dueDate. Ils sont SERVEUR-ONLY (get_subscription_overview
// et get_my_subscription_status). Ce miroir reste fidèle pour les 4 statuts historiques.

import type { SubscriptionStatus } from '../types';

/** Échéance considérée « proche » si dans ≤ ce nombre de jours (cf. RPC get_subscription_overview) */
export const DUE_SOON_THRESHOLD_DAYS = 5;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export interface SubscriptionStatusResult {
  status: SubscriptionStatus;
  /** Jours avant l'échéance (négatif si dépassée, null si jamais payé) */
  daysUntilDue: number | null;
}

/**
 * Dérive le statut d'abonnement à partir de la date d'échéance.
 * @param dueDate - Date ISO de la prochaine échéance (subscriptionDueDate), ou undefined
 * @param now - Date de référence (injectable pour les tests)
 */
export function computeSubscriptionStatus(
  dueDate: string | undefined,
  now: Date = new Date()
): SubscriptionStatusResult {
  if (!dueDate) {
    return { status: 'never_paid', daysUntilDue: null };
  }

  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) {
    return { status: 'never_paid', daysUntilDue: null };
  }

  // Comparaison en jours calendaires (normalisés à minuit) pour éviter les effets d'heure
  const dueMidnight = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const daysUntilDue = Math.round((dueMidnight - nowMidnight) / ONE_DAY_MS);

  if (daysUntilDue < 0) {
    return { status: 'overdue', daysUntilDue };
  }
  if (daysUntilDue <= DUE_SOON_THRESHOLD_DAYS) {
    return { status: 'due_soon', daysUntilDue };
  }
  return { status: 'up_to_date', daysUntilDue };
}

/** Ajoute N mois à une date (gère le débordement de fin de mois). */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const targetMonth = result.getMonth() + months;
  result.setMonth(targetMonth);
  return result;
}

/**
 * Calcule la nouvelle échéance après un paiement.
 * Repart de l'échéance courante si elle est dans le futur (paiement anticipé),
 * sinon de « now » (échéance déjà dépassée — on repart de maintenant).
 */
export function computeNextDueDate(
  currentDueDate: string | undefined,
  monthsCovered: number,
  now: Date = new Date()
): Date {
  let base = now;
  if (currentDueDate) {
    const current = new Date(currentDueDate);
    if (!Number.isNaN(current.getTime()) && current.getTime() > now.getTime()) {
      base = current;
    }
  }
  return addMonths(base, monthsCovered);
}

/** Ordre de tri : retards en premier, puis échéances proches, etc.
 *  Aligné sur l'ORDER BY de get_subscription_overview (exempt en dernier). */
const STATUS_SORT_ORDER: Record<SubscriptionStatus, number> = {
  overdue: 0,
  due_soon: 1,
  never_paid: 2,
  trial: 3,
  up_to_date: 4,
  exempt: 5,
};

export function subscriptionStatusSortWeight(status: SubscriptionStatus): number {
  return STATUS_SORT_ORDER[status];
}

/** Libellés FR pour affichage */
export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  up_to_date: 'À jour',
  due_soon: 'Échéance proche',
  overdue: 'En retard',
  never_paid: 'Jamais payé',
  trial: 'Essai gratuit',
  exempt: 'Exempté',
};

/**
 * Durées d'abonnement proposées au paiement (manuel admin ET FedaPay).
 * Source unique : utilisée par RecordPaymentModal et MySubscriptionSection.
 */
export const SUBSCRIPTION_MONTHS_OPTIONS = [
  { value: '1', label: '1 mois' },
  { value: '3', label: '3 mois' },
  { value: '6', label: '6 mois' },
  { value: '12', label: '12 mois (1 an)' },
] as const;

/** Formatage FR d'une date ISO d'abonnement (échéance, début). Vide → '—'. */
export function formatSubscriptionDate(
  date: string | undefined,
  dateStyle: 'medium' | 'long' = 'medium',
): string {
  return date
    ? new Intl.DateTimeFormat('fr-FR', { dateStyle }).format(new Date(date))
    : '—';
}
