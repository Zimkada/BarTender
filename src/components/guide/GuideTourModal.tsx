/**
 * GuideTourModal
 * Modern, animated tour modal component
 * Premium Glassmorphism Design
 * Features: Dynamic Brand Colors, Progress bar, step navigation, rating system
 */

import React from 'react';
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
      duration: 0.4,
      type: 'spring',
      stiffness: 300,
      damping: 25,
    },
  },
  exit: { opacity: 0, scale: 0.95, y: 20 },
};

const contentVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: 'easeOut' },
  },
};

const overlayVariants = {
  hidden: { opacity: 0, backdropFilter: 'blur(0px)' },
  visible: {
    opacity: 1,
    backdropFilter: 'blur(4px)',
    transition: { duration: 0.3 }
  },
  exit: { opacity: 0, backdropFilter: 'blur(0px)' },
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
        return <strong key={i} className="font-bold text-[hsl(var(--brand-hue),var(--brand-saturation),20%)]">{part.slice(2, -2)}</strong>;
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
            className="fixed inset-0 bg-black/40 z-40"
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
            variants={overlayVariants} // Use same timing as overlay
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <motion.div
              // GLASSMORPHISM CARD
              className="w-full max-w-3xl backdrop-blur-xl bg-white/95 border border-white/40 shadow-2xl rounded-2xl max-h-[90vh] flex flex-col overflow-hidden ring-1 ring-black/5"
              variants={modalVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              {/* Header with close button */}
              <div className="flex items-center justify-between px-8 py-5 border-b border-[hsl(var(--brand-hue),var(--brand-saturation),90%)] flex-shrink-0 bg-white/40">
                <div className="flex items-center gap-4">
                  {activeTour.emoji && (
                    <span className="text-3xl p-2 bg-[hsl(var(--brand-hue),var(--brand-saturation),96%)] rounded-xl border border-[hsl(var(--brand-hue),var(--brand-saturation),90%)] shadow-sm">
                      {activeTour.emoji}
                    </span>
                  )}
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 tracking-tight">{activeTour.title}</h2>
                    <p className="text-xs text-[hsl(var(--brand-hue),var(--brand-saturation),40%)] font-medium uppercase tracking-wider mt-0.5">
                      {activeTour.estimatedDuration} min • Guide Interactif
                    </p>
                  </div>
                </div>
                <button
                  onClick={closeTour}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-black/5 transition"
                  aria-label="Close guide"
                >
                  ✕
                </button>
              </div>

              {/* Progress bar */}
              <div className="px-8 pt-6 flex-shrink-0">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-700 font-medium">
                    Étape <span className="text-[hsl(var(--brand-hue),var(--brand-saturation),45%)] font-bold">{currentStepIndex + 1}</span> sur{' '}
                    <span className="font-bold">{activeTour.steps.length}</span>
                  </span>
                  <span className="text-xs text-gray-500 font-medium">{Math.round(progress)}%</span>
                </div>
                <div className="h-2 bg-[hsl(var(--brand-hue),var(--brand-saturation),94%)] rounded-full overflow-hidden border border-black/5">
                  <motion.div
                    className="h-full bg-[image:var(--brand-gradient)] shadow-lg"
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.6, ease: 'circOut' }}
                  />
                </div>
              </div>

              {/* Content */}
              <motion.div
                key={`step-${currentStepIndex}`}
                className="flex-1 overflow-y-auto px-8 py-6 space-y-6 scrollbar-bottom"
                variants={contentVariants}
                initial="hidden"
                animate="visible"
              >
                {/* Step title */}
                <div className="flex items-start gap-4">
                  {currentStep.emoji && <span className="text-2xl flex-shrink-0 mt-1">{currentStep.emoji}</span>}
                  <h3 className="text-2xl font-bold text-gray-900 leading-tight">{currentStep.title}</h3>
                </div>

                {/* Step description */}
                <div className="text-lg text-gray-600 leading-relaxed max-w-lg">
                  {/* Wrapping in div instead of p to avoid nesting issues if formattedText causes block elements (though it returns strong) */}
                  <p>{renderFormattedText(currentStep.description)}</p>
                </div>

                {/* Media */}
                {currentStep.media && (
                  <div className="my-6 rounded-xl overflow-hidden shadow-lg ring-1 ring-black/5">
                    {currentStep.media.type === 'image' && (
                      <img
                        src={currentStep.media.url}
                        alt={currentStep.media.alt}
                        className="w-full h-auto max-h-56 object-cover hover:scale-105 transition duration-700"
                      />
                    )}
                    {currentStep.media.type === 'video' && (
                      <video
                        src={currentStep.media.url}
                        className="w-full h-auto max-h-56 object-cover"
                        controls
                      />
                    )}
                  </div>
                )}

                {/* Pro tips - Brand Themed */}
                {currentStep.tips && currentStep.tips.length > 0 && (
                  <div className="mt-6 p-5 bg-[hsl(var(--brand-hue),var(--brand-saturation),98%)] border border-[hsl(var(--brand-hue),var(--brand-saturation),85%)] rounded-xl relative overflow-hidden">
                    {/* Decorative gradient blob */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-[image:var(--brand-gradient)] opacity-5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />

                    <p className="text-sm font-bold text-[hsl(var(--brand-hue),var(--brand-saturation),30%)] mb-3 flex items-center gap-2 relative z-10">
                      💡 Astuces Pro
                    </p>
                    <ul className="text-sm text-[hsl(var(--brand-hue),var(--brand-saturation),25%)] space-y-2 relative z-10">
                      {currentStep.tips.map((tip, idx) => (
                        <li key={idx} className="flex items-start gap-2.5">
                          <span className="text-[hsl(var(--brand-hue),var(--brand-saturation),50%)] mt-0.5 font-bold">✓</span>
                          <span className="leading-relaxed">{renderFormattedText(tip)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Action text */}
                {currentStep.action && (
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-600 italic">
                    <span className="animate-pulse">👉</span> {currentStep.action}
                  </div>
                )}

                {/* Rating (last step only) */}
                {isLastStep && (
                  <div className="mt-8 pt-6 border-t border-[hsl(var(--brand-hue),var(--brand-saturation),90%)] text-center">
                    <p className="text-base text-gray-800 font-semibold mb-4">
                      Ce guide vous a-t-il été utile ?
                    </p>
                    <div className="flex gap-4 justify-center">
                      {[1, 2, 3, 4, 5].map(rating => (
                        <motion.button
                          key={rating}
                          onClick={() => rateTour(rating as 1 | 2 | 3 | 4 | 5)}
                          className="text-4xl hover:scale-110 transition cursor-pointer filter hover:drop-shadow-md select-none"
                          whileHover={{ scale: 1.2, rotate: [0, -10, 10, 0] }}
                          whileTap={{ scale: 0.9 }}
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
                <div className="px-8 py-3 bg-red-50 border-t border-red-200 flex-shrink-0 animate-pulse">
                  <div className="flex items-start gap-2">
                    <span className="text-red-600 text-lg flex-shrink-0">⚠️</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-red-800">Erreur de sauvegarde</p>
                      <p className="text-xs text-red-700 mt-1">{error}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Footer with buttons - Glass Effect */}
              <div className="px-8 py-5 border-t border-[hsl(var(--brand-hue),var(--brand-saturation),90%)] bg-white/60 backdrop-blur-md flex gap-4 flex-shrink-0">
                {!isFirstStep && (
                  <Button variant="outline" onClick={prevStep} disabled={isLoading} className="border-gray-300 hover:bg-gray-50">
                    ← Retour
                  </Button>
                )}

                <Button
                  variant="ghost"
                  onClick={skipTour}
                  disabled={isLoading}
                  className="ml-auto text-gray-500 hover:text-gray-900 hover:bg-black/5"
                >
                  Fermer
                </Button>

                <Button
                  onClick={isLastStep ? completeTour : nextStep}
                  disabled={isLoading}
                  className="gap-2 shadow-lg hover:shadow-xl transition-all bg-[image:var(--brand-gradient)] text-white border-0 hover:brightness-110"
                >
                  {isLoading && <Spinner className="h-4 w-4 text-white" />}
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

