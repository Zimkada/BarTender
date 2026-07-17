import React, { useState, useMemo } from 'react';
import { CreditCard } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { useBeninCurrency } from '../../hooks/useBeninCurrency';
import { useSubscriptions } from '../../hooks/useSubscriptions';
import { SUBSCRIPTION_MONTHS_OPTIONS } from '../../utils/subscriptionHelpers';
import { getPlanPrice } from '../../config/plans';
import type { Bar, SubscriptionPaymentMethod } from '../../types';

interface RecordPaymentModalProps {
  bar: Bar;
  onClose: () => void;
  onRecorded: () => void;
}

const METHOD_OPTIONS: { value: SubscriptionPaymentMethod; label: string }[] = [
  { value: 'momo', label: 'Mobile Money' },
  { value: 'cash', label: 'Espèces' },
  { value: 'bank', label: 'Virement bancaire' },
  { value: 'other', label: 'Autre' },
];

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({ bar, onClose, onRecorded }) => {
  const { formatPrice } = useBeninCurrency();
  const { recordPayment, isRecording, error } = useSubscriptions();

  const monthlyPrice = getPlanPrice(bar.settings?.plan);

  const [months, setMonths] = useState('1');
  const [method, setMethod] = useState<SubscriptionPaymentMethod>('momo');
  const [notes, setNotes] = useState('');

  // Montant attendu = prix du plan × mois. Pré-rempli mais éditable (espèces/momo varient).
  const expectedAmount = useMemo(() => monthlyPrice * Number(months), [monthlyPrice, months]);
  const [amount, setAmount] = useState<string>(String(expectedAmount));

  // Recaler le montant quand le nombre de mois change (sauf si l'utilisateur a déjà saisi un montant custom)
  const [amountTouched, setAmountTouched] = useState(false);
  const effectiveAmount = amountTouched ? Number(amount) : expectedAmount;

  const handleSubmit = async () => {
    try {
      await recordPayment({
        barId: bar.id,
        amount: effectiveAmount,
        monthsCovered: Number(months),
        method,
        notes: notes.trim() || undefined,
      });
      onRecorded();
      onClose();
    } catch {
      // L'erreur est exposée via `error` ; on garde la modale ouverte.
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Enregistrer un paiement"
      description={bar.name}
      icon={<CreditCard className="w-5 h-5" />}
      size="default"
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose} disabled={isRecording}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={isRecording || effectiveAmount <= 0 || Number.isNaN(effectiveAmount)}>
            {isRecording ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-muted p-3 text-sm text-foreground/70">
          Plan actuel : <span className="font-semibold">{bar.settings?.plan || 'starter'}</span> —{' '}
          {formatPrice(monthlyPrice)}/mois
        </div>

        <Select
          label="Nombre de mois couverts"
          options={[...SUBSCRIPTION_MONTHS_OPTIONS]}
          value={months}
          onChange={(e) => {
            setMonths(e.target.value);
            if (!amountTouched) setAmount(String(monthlyPrice * Number(e.target.value)));
          }}
        />

        <Input
          label="Montant encaissé (XOF)"
          type="number"
          min={0}
          value={amountTouched ? amount : String(expectedAmount)}
          onChange={(e) => {
            setAmountTouched(true);
            setAmount(e.target.value);
          }}
          helperText={`Attendu : ${formatPrice(expectedAmount)}. Le montant doit être strictement positif.`}
        />

        <Select
          label="Méthode de paiement"
          options={METHOD_OPTIONS}
          value={method}
          onChange={(e) => setMethod(e.target.value as SubscriptionPaymentMethod)}
        />

        <Input
          label="Notes (optionnel)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Réf. transaction, remarque…"
        />

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  );
};

RecordPaymentModal.displayName = 'RecordPaymentModal';
export default RecordPaymentModal;
