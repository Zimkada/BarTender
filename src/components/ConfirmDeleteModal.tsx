import React, { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  title: string;
  message: string;
  itemName: string; // Le nom de l'élément à supprimer (ex: "Bière")
  itemType: 'produit' | 'catégorie' | 'item'; // Type d'élément
  isLoading?: boolean;
  variant?: 'danger' | 'critical'; // 'danger' = risque moyen, 'critical' = haute conséquence
}

/**
 * Modal de confirmation pour suppression destructive
 * Demande une double confirmation:
 * 1. Confirmation visuelle (bouton)
 * 2. Saisie du nom de l'élément (pour éviter les cliques accidentels)
 */
export function ConfirmDeleteModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  itemName,
  itemType,
  isLoading = false,
  variant = 'danger'
}: ConfirmDeleteModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (confirmText !== itemName) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onConfirm();
      handleClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setConfirmText('');
    onClose();
  };

  const isConfirmDisabled = confirmText !== itemName || isSubmitting || isLoading;
  const isCritical = variant === 'critical';

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      title={title}
      size="sm"
      footer={
        <div className="flex justify-end gap-3 mt-6">
          <Button
            onClick={handleClose}
            variant="secondary"
            disabled={isSubmitting || isLoading}
            className="px-4 py-2"
          >
            Annuler
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isConfirmDisabled}
            className={`px-4 py-2 flex items-center gap-2 ${
              isCritical
                ? 'bg-red-600 hover:bg-red-700 text-white disabled:bg-red-300'
                : 'bg-orange-600 hover:bg-orange-700 text-white disabled:bg-orange-300'
            }`}
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSubmitting ? 'Suppression...' : 'Supprimer définitivement'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Alert Icon + Warning */}
        <div className="flex gap-3">
          <AlertTriangle
            className={`w-6 h-6 flex-shrink-0 mt-0.5 ${
              isCritical ? 'text-red-600' : 'text-orange-600'
            }`}
          />
          <div>
            <h3 className="font-semibold text-gray-900">{message}</h3>
            <p className="text-sm text-gray-600 mt-1">
              Cette action est{' '}
              <span className="font-semibold">irréversible</span> et ne peut pas être
              annulée.
            </p>
          </div>
        </div>

        {/* Item Details */}
        <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-600">
            {itemType === 'produit' && `Produit à supprimer:`}
            {itemType === 'catégorie' && `Catégorie à supprimer:`}
            {itemType === 'item' && `Élément à supprimer:`}
          </p>
          <p className="text-base font-mono font-semibold text-gray-900 mt-1">
            {itemName}
          </p>
        </div>

        {/* Confirmation Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tapez le nom {itemType === 'produit' ? 'du produit' : 'de la catégorie'} pour confirmer la
            suppression:
          </label>
          <Input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={itemName}
            className="font-mono"
            disabled={isSubmitting || isLoading}
            autoFocus
          />
          <p className="text-xs text-gray-500 mt-1">
            {confirmText === itemName ? (
              <span className="text-green-600">✓ Confirmation valide</span>
            ) : (
              <span>Doit correspondre exactement à "{itemName}"</span>
            )}
          </p>
        </div>

        {/* Additional Warning for Critical */}
        {isCritical && (
          <div className="bg-red-50 border border-red-200 p-3 rounded-lg">
            <p className="text-xs text-red-800">
              <span className="font-semibold">⚠️ Attention:</span> Cette suppression affectera tous les
              bars qui utilisent ce {itemType}.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
