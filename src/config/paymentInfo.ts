/**
 * paymentInfo.ts — Coordonnées de paiement MoMo direct (abonnement).
 *
 * Canal de paiement au démarrage (avant/en complément de FedaPay) : le bar paie
 * directement sur le/les numéro(s) Mobile Money du fondateur, en mettant dans le
 * MOTIF de la transaction une référence permettant d'identifier le bar. Le fondateur
 * (super_admin) constate le paiement, puis l'enregistre manuellement dans le
 * dashboard admin (RecordPaymentModal, method: 'momo').
 *
 * ⚠️ À REMPLIR : remplacer les placeholders ci-dessous par les VRAIS numéros.
 * Ces valeurs sont volontairement en dur (versionnées, sans risque de sécurité —
 * ce sont des numéros de réception publics, pas des secrets). Les modifier =
 * un redéploiement (rare).
 */

export interface MomoNumber {
  /** Opérateur affiché (ex. 'MTN MoMo', 'Moov Money') */
  operator: string;
  /** Numéro au format local lisible (ex. '+229 01 23 45 67 89') */
  number: string;
  /** Nom du bénéficiaire tel qu'il apparaît lors du paiement (rassure le payeur) */
  accountName: string;
}

export const MOMO_PAYMENT_NUMBERS: MomoNumber[] = [
  {
    operator: 'MTN MoMo',
    number: '+229 01 90 13 10 72',
    accountName: "GOUNOU N'GOBI C. Zimé",
  },
  {
    operator: 'Moov Money',
    number: '+229 01 55 28 25 25',
    accountName: "GOUNOU N'GOBI C. Zimé",
  },
  {
    operator: 'Celtiis Cash',
    number: '+229 01 40 34 40 39',
    accountName: "GOUNOU N'GOBI C. Zimé",
  },
];

/**
 * Normalise le nom d'un bar pour l'inclure dans un motif de transaction MoMo :
 * retire les accents, remplace les caractères non alphanumériques par des tirets,
 * met en majuscules, tronque à 20 caractères. Ex. « Le Privilège » → "LE-PRIVILEGE".
 * Garde le nom lisible pour le rapprochement dans le dashboard admin.
 */
export function normalizeBarName(name: string): string {
  const cleaned = name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // enlève les accents (diacritiques combinants)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')                        // tout le reste → tiret
    .replace(/^-+|-+$/g, '')                            // pas de tiret en bord
    .slice(0, 20)
    .replace(/-+$/g, '');                               // ni après troncature
  return cleaned || 'BAR';                              // fallback si nom vide/exotique
}

/**
 * Construit le MOTIF normalisé à copier dans la transaction MoMo.
 * Format : <NOM_BAR> — pas de préfixe, les numéros de réception sont dédiés
 * exclusivement aux abonnements bars (rien d'autre à distinguer).
 *
 * Volontairement minimal : le motif identifie SEULEMENT le bar. Le plan et la
 * durée ne sont pas dupliqués dans le motif — ils sont visibles dans le
 * formulaire au moment du paiement, et le MONTANT reçu permet à lui seul de
 * déduire le nombre de mois payés (prix du plan du bar déjà connu).
 * Ex. : « Le Privilège » → "LE-PRIVILEGE".
 */
export function buildPaymentReference(params: { barName: string }): string {
  return normalizeBarName(params.barName);
}
