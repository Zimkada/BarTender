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
 * ⭐ EMPILEMENT : repart TOUJOURS de l'échéance courante (passée OU future),
 * sinon de « now » uniquement si aucune échéance n'existe (jamais initialisée).
 * Un bar en retard ne « gagne » donc pas de temps gratuit en tardant.
 * Miroir exact de _advance_subscription_due (migration 20260726000000) :
 * period_start = COALESCE(échéance, now()).
 */
export function computeNextDueDate(
  currentDueDate: string | undefined,
  monthsCovered: number,
  now: Date = new Date()
): Date {
  let base = now;
  if (currentDueDate) {
    const current = new Date(currentDueDate);
    if (!Number.isNaN(current.getTime())) {
      base = current; // passée ou future : on empile toujours dessus
    }
  }
  return addMonths(base, monthsCovered);
}

/**
 * Ajoute N mois à une date UTC en CLAMPANT la fin de mois (comme l'opérateur
 * `+ interval` de PostgreSQL), contrairement à `addMonths` (Date.setMonth) qui
 * DÉBORDE (31 jan + 1 mois = 2 ou 3 mars en JS, alors que Postgres donne 28 fév).
 * Utilisé UNIQUEMENT par monthsOverdue pour rester le miroir exact du SQL.
 */
function addMonthsUtcClamped(y: number, m: number, d: number, add: number): Date {
  const targetMonthIndex = m + add;
  const ty = y + Math.floor(targetMonthIndex / 12);
  const tm = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate(); // dernier jour du mois cible
  return new Date(Date.UTC(ty, tm, Math.min(d, lastDay)));
}

/**
 * Nombre de mois de retard, arrondi au mois SUPÉRIEUR.
 * Règle métier : « tout mois entamé au-delà de l'échéance est dû ».
 * 0 si pas d'échéance ou échéance future.
 *
 * ⭐ Miroir EXACT de la fonction SQL public.months_overdue (migration 20260726000000).
 * Deux précautions pour rester aligné sur le SQL (la certification a révélé 2 axes
 * de divergence) :
 *   1. Comparaison en dates UTC (le SQL fait `::date` sur une session Postgres UTC ;
 *      utiliser l'heure LOCALE du navigateur faisait basculer le jour au Bénin UTC+1).
 *   2. Ajout de mois CLAMPÉ en fin de mois (le SQL clampe via `+ interval` ; addMonths
 *      JS débordait, donnant un résultat faux sur les échéances au 29/30/31).
 *
 * ⚠️ L'UI (MySubscriptionSection) ne recalcule PLUS le retard côté client : elle lit
 * subscription.monthsOverdue / amountDue du serveur. Cette fonction reste le miroir
 * de référence (tests + éventuels usages internes) et DOIT rester identique au SQL.
 *
 * Ex : échéance 2026-03-01, now 2026-05-20 → 3 mois (2 mois entiers + 19 j entamés).
 */
export function monthsOverdue(
  dueDate: string | undefined,
  now: Date = new Date()
): number {
  if (!dueDate) return 0;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return 0;

  // Dates UTC (aligné sur le cast ::date côté SQL en session UTC).
  const dy = due.getUTCFullYear(), dm = due.getUTCMonth(), dd = due.getUTCDate();
  const dueMid = Date.UTC(dy, dm, dd);
  const nowMid = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (dueMid >= nowMid) return 0; // future ou aujourd'hui

  // Mois calendaires entiers écoulés, avec clamping de fin de mois (comme Postgres).
  let full = 0;
  while (addMonthsUtcClamped(dy, dm, dd, full + 1).getTime() <= nowMid) {
    full += 1;
  }
  // Reste-t-il des jours au-delà du dernier mois entier ? → mois entamé, +1.
  const anchor = addMonthsUtcClamped(dy, dm, dd, full).getTime();
  return anchor < nowMid ? full + 1 : Math.max(full, 1);
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
