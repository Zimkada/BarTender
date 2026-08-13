/**
 * CancelItemModal
 * Annulation d'une ligne cuisine — §6.1, §16.4.
 *
 * ⭐⭐ LE MOTIF EST OBLIGATOIRE ET STRUCTURÉ (§16.4)
 * « Annulé » sans cause ne permet de corriger aucun processus. Une rupture
 * d'ingrédient et une erreur de saisie du serveur appellent des actions
 * opposées — les confondre revient à ne rien mesurer.
 *
 * ⭐ AVERTISSEMENT DE PERTE avant confirmation : annuler APRÈS `ready` a déjà
 * consommé la matière, et elle NE revient PAS en stock (§6). Le dire au moment
 * du geste est la seule façon de rendre la perte visible — après coup, elle se
 * dilue dans un écart d'inventaire que personne n'attribue.
 */

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { CANCEL_REASON_LABELS } from '../../hooks/mutations/useKitchenMutations';
import type {
  KitchenCancelReason,
  KitchenQueueItem,
} from '../../services/supabase/kitchen.service';

interface Props {
  item: KitchenQueueItem | null;
  onClose: () => void;
  onConfirm: (reason: KitchenCancelReason, note?: string) => void;
  isPending: boolean;
}

const REASONS = Object.keys(CANCEL_REASON_LABELS) as KitchenCancelReason[];

export function CancelItemModal({ item, onClose, onConfirm, isPending }: Props) {
  const [reason, setReason] = useState<KitchenCancelReason | null>(null);
  const [note, setNote] = useState('');

  if (!item) return null;

  /**
   * ⭐ La matière est-elle DÉJÀ sortie ? `consumed_at` est la source de vérité,
   * pas le statut : c'est lui qui porte le décrément FEFO (§6).
   */
  const isLoss = item.consumed_at !== null;

  const handleClose = () => {
    setReason(null);
    setNote('');
    onClose();
  };

  return (
    <Modal open onClose={handleClose} title={`Annuler « ${item.dish_name} »`}>
      <div className="space-y-4">
        {isLoss && (
          <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
            <p className="text-sm text-amber-900 dark:text-amber-200">
              Ce plat est déjà préparé : les ingrédients ont été sortis du stock et
              <strong> ne seront pas remis</strong>. Cette annulation sera comptée
              comme une perte.
            </p>
          </div>
        )}

        <div>
          <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            Pourquoi ce plat est-il annulé&nbsp;?
          </p>
          {/* ⚠️ Boutons radio et non liste déroulante : le motif doit être VU,
              pas cherché. Une liste fermée fait choisir le premier élément. */}
          <div className="space-y-1.5">
            {REASONS.map((r) => (
              <label
                key={r}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 p-2.5 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                <input
                  type="radio"
                  name="cancel-reason"
                  className="accent-brand"
                  checked={reason === r}
                  onChange={() => setReason(r)}
                />
                <span className="text-sm text-gray-900 first-letter:uppercase dark:text-gray-100">
                  {CANCEL_REASON_LABELS[r]}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label
            htmlFor="cancel-note"
            className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Précision (facultatif)
          </label>
          {/* ⚠️ COMPLÉMENT du motif structuré, jamais son remplaçant (§16.4). */}
          <input
            id="cancel-note"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
            placeholder="Ex : le client a changé d'avis"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={handleClose} disabled={isPending}>
            Retour
          </Button>
          <Button
            onClick={() => reason && onConfirm(reason, note.trim() || undefined)}
            // ⭐ Désactivé tant qu'aucun motif : l'obligation est APPLIQUÉE,
            // pas seulement affichée.
            disabled={!reason || isPending}
            className="bg-red-600 hover:bg-red-700"
          >
            Confirmer l'annulation
          </Button>
        </div>
      </div>
    </Modal>
  );
}
