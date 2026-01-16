/**
 * GuideTourModal
 * Modern, animated tour modal component
 * Responsive (mobile full-screen, desktop centered)
 * Features: Progress bar, step navigation, rating system
 */

import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGuide } from '@/context/GuideContext';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';

/**
 * Animation variants
 */
const modalVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 20 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: 0.3,
      type: 'spring',
      stiffness: 300,
      damping: 20,
    },
  },
  exit: { opacity: 0, scale: 0.95, y: 20 },
};

const contentVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2 },
  },
};

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

/**
 * Main component
 */
export const GuideTourModal: React.FC = () => {
  const {
    activeTour,
    currentStepIndex,
    isVisible,
    isLoading,
    error,
    nextStep,
    prevStep,
    completeTour,
    skipTour,
    rateTour,
    closeTour,
    getProgressPercentage,
  } = useGuide();

  // Don't render if no tour active
  if (!activeTour || !isVisible) return null;

  const currentStep = activeTour.steps[currentStepIndex];
  if (!currentStep) return null;

  const progress = getProgressPercentage();
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === activeTour.steps.length - 1;

  /**
   * Helper to render text with bold support (**)
   */
  const renderFormattedText = (text: string) => {
    if (!text) return null;
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-bold text-gray-900">{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <>
          {/* Overlay */}
          <motion.div
            key="overlay"
            className="fixed inset-0 bg-black/30 z-40"
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={closeTour}
          />

          {/* Modal */}
          <motion.div
            key="modal"
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <motion.div
              className="w-full max-w-2xl bg-white rounded-lg shadow-2xl max-h-[90vh] flex flex-col"
              variants={modalVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              {/* Header with close button */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
                <div className="flex items-center gap-3">
                  {activeTour.emoji && <span className="text-2xl">{activeTour.emoji}</span>}
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">{activeTour.title}</h2>
                    <p className="text-xs text-gray-500">{activeTour.estimatedDuration} min</p>
                  </div>
                </div>
                <button
                  onClick={closeTour}
                  className="text-gray-400 hover:text-gray-600 transition"
                  aria-label="Close guide"
                >
                  ✕
                </button>
              </div>

              {/* Progress bar */}
              <div className="px-6 pt-4 flex-shrink-0">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-700 font-medium">
                    Étape <span className="text-blue-600 font-bold">{currentStepIndex + 1}</span> sur{' '}
                    <span className="font-bold">{activeTour.steps.length}</span>
                  </span>
                  <span className="text-xs text-gray-500">{Math.round(progress)}% complété</span>
                </div>
                <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-blue-500 to-blue-600"
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.5, ease: 'easeInOut' }}
                  />
                </div>
              </div>

              {/* Content */}
              <motion.div
                key={`step-${currentStepIndex}`}
                className="flex-1 overflow-y-auto px-6 py-6 space-y-4"
                variants={contentVariants}
                initial="hidden"
                animate="visible"
              >
                {/* Step title */}
                <div className="flex items-start gap-3">
                  {currentStep.emoji && <span className="text-2xl flex-shrink-0">{currentStep.emoji}</span>}
                  <h3 className="text-xl font-semibold text-gray-900">{currentStep.title}</h3>
                </div>

                {/* Step description */}
                <p className="text-base text-gray-700 leading-relaxed max-w-lg">
                  {renderFormattedText(currentStep.description)}
                </p>

                {/* Media */}
                {currentStep.media && (
                  <div className="my-4 rounded-lg overflow-hidden bg-gray-100">
                    {currentStep.media.type === 'image' && (
                      <img
                        src={currentStep.media.url}
                        alt={currentStep.media.alt}
                        className="w-full h-auto max-h-48 object-cover"
                      />
                    )}
                    {currentStep.media.type === 'video' && (
                      <video
                        src={currentStep.media.url}
                        className="w-full h-auto max-h-48 object-cover"
                        controls
                      />
                    )}
                  </div>
                )}

                {/* Pro tips */}
                {currentStep.tips && currentStep.tips.length > 0 && (
                  <div className="mt-4 p-4 bg-amber-50 border-l-4 border-amber-500 rounded">
                    <p className="text-sm font-semibold text-amber-900 mb-2">💡 Astuces Professionnelles</p>
                    <ul className="text-sm text-amber-800 space-y-1">
                      {currentStep.tips.map((tip, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-amber-600 mt-0.5">✓</span>
                          <span>{renderFormattedText(tip)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Action text */}
                {currentStep.action && (
                  <p className="text-sm text-gray-600 italic">→ {currentStep.action}</p>
                )}

                {/* Rating (last step only) */}
                {isLastStep && (
                  <div className="mt-6 pt-4 border-t border-gray-200">
                    <p className="text-sm text-gray-700 font-medium mb-3">
                      Ce guide vous a-t-il été utile ?
                    </p>
                    <div className="flex gap-2 justify-center">
                      {[1, 2, 3, 4, 5].map(rating => (
                        <motion.button
                          key={rating}
                          onClick={() => rateTour(rating as 1 | 2 | 3 | 4 | 5)}
                          className="text-3xl hover:scale-125 transition cursor-pointer"
                          whileHover={{ scale: 1.3 }}
                          whileTap={{ scale: 1.1 }}
                          disabled={isLoading}
                        >
                          ⭐
                        </motion.button>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>

              {/* Error Display with Retry */}
              {error && (
                <div className="px-6 py-3 bg-red-50 border-t border-red-200 flex-shrink-0">
                  <div className="flex items-start gap-2">
                    <span className="text-red-600 text-lg flex-shrink-0">⚠️</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-red-800">Erreur de sauvegarde</p>
                      <p className="text-xs text-red-700 mt-1">{error}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Footer with buttons */}
              <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex gap-3 flex-shrink-0">
                {!isFirstStep && (
                  <Button variant="outline" onClick={prevStep} disabled={isLoading}>
                    ← Retour
                  </Button>
                )}

                <Button
                  variant="ghost"
                  onClick={skipTour}
                  disabled={isLoading}
                  className="ml-auto"
                >
                  Fermer
                </Button>

                <Button
                  onClick={isLastStep ? completeTour : nextStep}
                  disabled={isLoading}
                  className="gap-2"
                >
                  {isLoading && <Spinner className="h-4 w-4" />}
                  {isLastStep ? 'Terminer' : 'Suivant →'}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
