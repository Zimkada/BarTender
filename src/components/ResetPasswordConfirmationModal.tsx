import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User } from '../types';
import { X } from 'lucide-react';
import { Button } from './ui/Button'; // Assuming you have a Button component

interface ResetPasswordConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  onConfirm: (user: User) => void;
}

export const ResetPasswordConfirmationModal: React.FC<ResetPasswordConfirmationModalProps> = ({
  isOpen,
  onClose,
  user,
  onConfirm,
}) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
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
            className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 relative"
          >
            <button onClick={onClose} className="absolute top-4 right-4 text-gray-600 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-xl font-semibold text-gray-900 mb-4">Confirmer la réinitialisation du mot de passe</h3>
            <p className="text-gray-700 mb-6">
              Voulez-vous vraiment envoyer un lien de réinitialisation de mot de passe à l'utilisateur{' '}
              <span className="font-medium text-purple-600">{user.name}</span> (
              <span className="font-medium text-purple-600">{user.email}</span>) ?
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={onClose}>
                Annuler
              </Button>
              <Button
                variant="destructive" // Assuming a destructive variant for confirmation
                onClick={() => onConfirm(user)}
              >
                Confirmer l'envoi
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
