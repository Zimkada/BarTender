import React, { useState } from 'react';
import { Gift } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { useSubscriptions } from '../../hooks/useSubscriptions';
import type { Bar } from '../../types';

interface GrantFreeMonthsModalProps {
  bar: Bar;
  onClose: () => void;
  onSaved: () => void;
}

const MONTHS_OPTIONS = [
  { value: '1', label: '1 mois' },
  { value: '2', label: '2 mois' },
  { value: '3', label: '3 mois' },
  { value: '6', label: '6 mois' },
  { value: '12', label: '12 mois' },
];

/**
 * Offrir des mois d'abonnement à un bar (geste ponctuel, super_admin only).
 * Distinct de l'exemption : le bar paie normalement par ailleurs, on lui avance
 * juste l'échéance de N mois sans paiement. Tracé dans l'historique (provider='offert').
 */
export const GrantFreeMonthsModal: React.FC<GrantFreeMonthsModalProps> = ({ bar, onClose, onSaved }) => {
  const { grantFreeMonths, isRecording, error } = useSubscriptions();

  const [months, setMonths] = useState('1');
  const [reason, setReason] = useState('');

  const canSubmit = reason.trim().length > 0;

  const handleSubmit = async () => {
    try {
      await grantFreeMonths({ barId: bar.id, months: Number(months), reason: reason.trim() });
      onSaved();
      onClose();
    } catch {
      // erreur exposée via `error`, on garde la modale ouverte
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Offrir des mois"
      description={bar.name}
      icon={<Gift className="w-5 h-5" />}
      size="default"
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose} disabled={isRecording}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={isRecording || !canSubmit}>
            {isRecording ? 'Enregistrement…' : 'Offrir'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-foreground/70">
          Avance l'échéance de ce bar sans paiement. Le bar continue de payer normalement
          par la suite. Le geste est tracé dans l'historique des paiements.
        </p>

        <Select
          label="Nombre de mois offerts"
          options={MONTHS_OPTIONS}
          value={months}
          onChange={(e) => setMonths(e.target.value)}
        />

        <Input
          label="Motif"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ex. : Cadeau de bienvenue, compensation incident…"
          helperText="Obligatoire — tracé pour le suivi commercial."
        />

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  );
};

GrantFreeMonthsModal.displayName = 'GrantFreeMonthsModal';
export default GrantFreeMonthsModal;
