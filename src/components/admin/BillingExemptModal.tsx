import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Alert } from '../ui/Alert';
import { useSubscriptions } from '../../hooks/useSubscriptions';
import type { Bar } from '../../types';

interface BillingExemptModalProps {
  bar: Bar;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Exemption de facturation d'un bar (super_admin only).
 * Couvre les bars tests ET les bars partenaires réels — d'où le motif obligatoire
 * à l'activation. L'écriture passe par le RPC set_bar_billing_exempt (colonnes
 * protégées par trigger : impossible à contourner via l'API directe).
 */
export const BillingExemptModal: React.FC<BillingExemptModalProps> = ({ bar, onClose, onSaved }) => {
  const { setBillingExempt, isRecording, error } = useSubscriptions();

  const isCurrentlyExempt = bar.billingExempt ?? false;
  const [reason, setReason] = useState(bar.billingExemptReason ?? '');

  // Cible : on inverse l'état courant (activer si non-exempté, désactiver sinon)
  const nextExempt = !isCurrentlyExempt;
  const reasonRequired = nextExempt;
  const canSubmit = !reasonRequired || reason.trim().length > 0;

  const handleSubmit = async () => {
    try {
      await setBillingExempt({
        barId: bar.id,
        exempt: nextExempt,
        reason: nextExempt ? reason.trim() : undefined,
      });
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
      title={isCurrentlyExempt ? 'Retirer l\'exemption' : 'Exempter de facturation'}
      description={bar.name}
      icon={<ShieldCheck className="w-5 h-5" />}
      size="default"
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose} disabled={isRecording}>
            Annuler
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isRecording || !canSubmit}
            variant={isCurrentlyExempt ? 'destructive' : 'default'}
          >
            {isRecording
              ? 'Enregistrement…'
              : isCurrentlyExempt
                ? 'Retirer l\'exemption'
                : 'Exempter ce bar'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {isCurrentlyExempt ? (
          <>
            <Alert variant="warning" title="Ce bar est actuellement exempté">
              Motif : <span className="font-semibold">{bar.billingExemptReason || 'non précisé'}</span>.
              Retirer l'exemption le fera réapparaître dans le suivi normal des échéances.
            </Alert>
          </>
        ) : (
          <>
            <p className="text-sm text-foreground/70">
              Un bar exempté n'apparaît jamais en retard, est exclu du MRR et des relances,
              mais reste pleinement fonctionnel. Réservé aux bars tests et partenaires.
            </p>
            <Input
              label="Motif de l'exemption"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex. : Bar test interne, Partenariat commercial…"
              helperText="Obligatoire — tracé pour le suivi commercial."
            />
          </>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  );
};

BillingExemptModal.displayName = 'BillingExemptModal';
export default BillingExemptModal;
