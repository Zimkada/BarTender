import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { Textarea } from "../ui/Textarea";
import { Label } from "../ui/Label";

interface OtherReasonDialogProps {
  isOpen: boolean;
  onConfirm: (refund: boolean, restock: boolean, notes: string) => void;
  onCancel: () => void;
}

export function OtherReasonDialog({
  isOpen,
  onConfirm,
  onCancel,
}: OtherReasonDialogProps) {
  const [customRefund, setCustomRefund] = useState(false);
  const [customRestock, setCustomRestock] = useState(false);
  const [customNotes, setCustomNotes] = useState("");

  const handleSubmit = () => {
    if (!customNotes.trim()) {
      alert('Les notes sont obligatoires pour "Autre raison"');
      return;
    }
    onConfirm(customRefund, customRestock, customNotes);
    setCustomRefund(false);
    setCustomRestock(false);
    setCustomNotes("");
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-white rounded-2xl w-full max-w-md shadow-2xl"
        >
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="text-amber-600" size={24} />
              <h2 className="text-lg font-bold text-gray-800">
                Retour - Autre raison
              </h2>
            </div>

            <div className="space-y-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={customRefund}
                  onChange={(e) => setCustomRefund(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <p className="font-medium text-gray-800">
                    Rembourser le client
                  </p>
                  <p className="text-xs text-gray-500">
                    Le montant sera déduit du CA
                  </p>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={customRestock}
                  onChange={(e) => setCustomRestock(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                />
                <div>
                  <p className="font-medium text-gray-800">Remettre en stock</p>
                  <p className="text-xs text-gray-500">
                    Le produit sera remis en inventaire
                  </p>
                </div>
              </label>

              <div>
                <Label htmlFor="customNotes">
                  Notes <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="customNotes"
                  value={customNotes}
                  onChange={(e) => setCustomNotes(e.target.value)}
                  rows={4}
                  placeholder="Expliquez la raison du retour (obligatoire)..."
                  required
                />
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={onCancel}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={handleSubmit}
                  className="flex-1 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors"
                >
                  Valider
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
