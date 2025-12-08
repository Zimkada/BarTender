import React, { useState } from 'react';
import { MessageSquare, X, Send, Bug, Lightbulb, MessageCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFeedback } from '../hooks/useFeedback'; // Pour les notifs
import { useAuth } from '../context/AuthContext';
import { useBarContext } from '../context/BarContext';
import { FeedbackService } from '../services/supabase/feedback.service';
import { EnhancedButton } from './EnhancedButton';

interface FeedbackButtonProps {
  className?: string;
}

export const FeedbackButton = ({ className = '' }: FeedbackButtonProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState<'bug' | 'feature' | 'other'>('bug');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { showSuccess, showError } = useFeedback();
  const { currentSession } = useAuth();
  const { currentBar } = useBarContext();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!message.trim()) {
      showError("Veuillez entrer un message.");
      return;
    }

    if (!currentSession?.userId || !currentBar?.id) {
      showError("Vous devez être connecté pour envoyer un feedback.");
      return;
    }

    setIsSubmitting(true);
    try {
      await FeedbackService.submitFeedback({
        user_id: currentSession.userId,
        bar_id: currentBar.id,
        type,
        message,
        email: currentSession.email
      });
      showSuccess("Merci pour votre retour ! Nous allons l'étudier.");
      setIsOpen(false);
      setMessage('');
      setType('bug');
    } catch (error: any) {
      // Fallback gracieux si la table n'existe pas
      console.error(error);
      showError("Impossible d'envoyer le feedback pour le moment.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(true)}
        className={`flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors shadow-sm ${className}`}
      >
        <MessageSquare size={18} className="text-amber-500" />
        <span className="hidden sm:inline">Feedback</span>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setIsOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-6 text-white flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-bold">Votre avis compte</h3>
                  <p className="text-amber-100 text-sm">Aidez-nous à améliorer BarTender</p>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 hover:bg-white/20 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="p-6 space-y-6">
                {/* Type Selector */}
                <div className="grid grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setType('bug')}
                    className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${type === 'bug'
                        ? 'border-red-500 bg-red-50 text-red-600'
                        : 'border-gray-200 hover:border-red-200 hover:bg-red-50/50 text-gray-600'
                      }`}
                  >
                    <Bug size={24} />
                    <span className="text-xs font-medium">Bug</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('feature')}
                    className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${type === 'feature'
                        ? 'border-amber-500 bg-amber-50 text-amber-600'
                        : 'border-gray-200 hover:border-amber-200 hover:bg-amber-50/50 text-gray-600'
                      }`}
                  >
                    <Lightbulb size={24} />
                    <span className="text-xs font-medium">Idée</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('other')}
                    className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${type === 'other'
                        ? 'border-blue-500 bg-blue-50 text-blue-600'
                        : 'border-gray-200 hover:border-blue-200 hover:bg-blue-50/50 text-gray-600'
                      }`}
                  >
                    <MessageCircle size={24} />
                    <span className="text-xs font-medium">Autre</span>
                  </button>
                </div>

                {/* Message */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Message
                  </label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={
                      type === 'bug' ? "Décrivez le problème..." :
                        type === 'feature' ? "Quelle fonctionnalité souhaitez-vous ?" :
                          "Dites-nous tout..."
                    }
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 h-32 resize-none"
                    required
                  />
                </div>

                {/* Footer */}
                <div className="flex justify-end pt-2">
                  <EnhancedButton
                    type="submit"
                    variant="primary"
                    loading={isSubmitting}
                    className="w-full sm:w-auto flex justify-center items-center gap-2"
                  >
                    <Send size={18} />
                    Envoyer le feedback
                  </EnhancedButton>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};