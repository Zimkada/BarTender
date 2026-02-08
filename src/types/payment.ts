/**
 * Types stricts pour les méthodes de paiement
 */

export type PaymentMethod =
  | 'cash'
  | 'card'
  | 'mobile_money'
  | 'bank_transfer'
  | 'check'
  | 'credit';

/**
 * Type guard pour valider une méthode de paiement
 */
export function isValidPaymentMethod(value: string): value is PaymentMethod {
  return [
    'cash',
    'card',
    'mobile_money',
    'bank_transfer',
    'check',
    'credit'
  ].includes(value);
}

/**
 * Labels d'affichage pour les méthodes de paiement
 */
export const PaymentMethodLabels: Record<PaymentMethod, string> = {
  cash: 'Espèces',
  card: 'Carte bancaire',
  mobile_money: 'Mobile Money',
  bank_transfer: 'Virement bancaire',
  check: 'Chèque',
  credit: 'Crédit'
};
