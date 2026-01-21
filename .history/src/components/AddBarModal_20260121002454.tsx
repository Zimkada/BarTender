import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Building2, CheckCircle } from 'lucide-react';
import { User } from '../types';
import { AuthService } from '../services/supabase/auth.service';
import { useBarContext } from '../context/BarContext';
import { Alert } from './ui/Alert';
import { AddBarForm } from './AddBarForm';

interface AddBarModalProps {
  isOpen: boolean;
  onClose: () => void;
  promoter: User | null;
  onSuccess: () => void;
}

/**
 * Modal wrapper pour créer un bar pour un promoteur existant
 * Orchestre la logique métier (setupPromoterBar) et les states UI
 * Orchestrated by UsersManagementPage
 */
export function AddBarModal({ isOpen, onClose, promoter, onSuccess }: AddBarModalProps) {
  const { refreshBars } = useBarContext();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Reset state quand modal ferme
  useEffect(() => {
    if (!isOpen) {
      setLoading(false);
      setError(null);
      setSuccess(false);
    }
  }, [isOpen]);

  const handleSubmit = async (formData: { barName: string; barAddress: string; barPhone: string }) => {
    if (!promoter?.id) {
      setError('Promoteur non sélectionné');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Call RPC with separate address and phone parameters
      const result = await AuthService.setupPromoterBar(
        promoter.id,
        formData.barName,
        formData.barAddress || null,
        formData.barPhone || null
      );

      if (result.success) {
        setSuccess(true);
        // Recharger les bars pour afficher les adresses à jour
        await refreshBars();
        // Auto-ferme après 1.5s et notifie le parent
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 1500);
      } else {
        throw new Error(result.error || 'Erreur lors de la création du bar');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la création du bar';
      setError(message);
      console.error('Erreur création bar:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !promoter) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col"
        >
          {/* Header - Gradient Teal/Emerald pour bars */}
          <div className="bg-gradient-to-r from-teal-600 to-emerald-600 p-6 text-white relative">
            <button
              onClick={onClose}
              disabled={loading}
              className="absolute top-4 right-4 p-2 hover:bg-white/20 rounded-lg transition-colors disabled:opacity-50"
            >
              <X className="w-6 h-6" />
            </button>
            <div className="flex items-center gap-3">
              <Building2 className="w-8 h-8" />
              <div>
                <h2 className="text-2xl font-bold">Ajouter un bar</h2>
                <p className="text-teal-100 text-sm">Créer un nouveau bar pour le promoteur</p>
              </div>
            </div>
          </div>

          {/* Content - Scrollable */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Success Alert */}
            {success && (
              <div className="mb-4">
                <Alert variant="success" title="Bar créé avec succès">
                  <div className="flex items-center gap-2">
                    <CheckCircle size={16} />
                    <span>Le bar a été créé et lié au promoteur.</span>
                  </div>
                </Alert>
              </div>
            )}

            {/* Form */}
            {!success && (
              <AddBarForm
                promoterName={promoter.name || 'Promoteur'}
                onSubmit={handleSubmit}
                loading={loading}
                error={error}
              />
            )}
          </div>

          {/* Footer - Actions */}
          {!success && (
            <div className="p-6 bg-gray-50 border-t flex justify-end gap-3">
              <button
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors font-medium"
              >
                Annuler
              </button>
              {/* Note: Submit button is inside AddBarForm, pas de double bouton */}
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
