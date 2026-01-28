/**
 * GuideButton
 * Floating "?" button (bottom-right corner)
 * Shows popover with available guides
 * Modern, animated, accessible
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGuide } from '@/context/GuideContext';
import { useGuideSuggestions } from '@/hooks/useGuideSuggestions';
import { Button } from '@/components/ui/Button';
import { GuideTour } from '@/types/guide';

/**
 * Popover for guide suggestions
 */
const GuideSuggestionsPopover: React.FC<{
  suggestions: Array<{ id: string; title: string; emoji?: string; isNew: boolean; guide?: GuideTour }>;
  onSelectGuide: (guideId: string, guide?: GuideTour) => void;
  isOpen: boolean;
}> = ({ suggestions, onSelectGuide, isOpen }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="absolute top-16 right-0 w-72 md:w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-50 flex flex-col max-h-[70vh] md:max-h-96"
          initial={{ opacity: 0, scale: 0.95, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-200 flex-shrink-0">
            <h3 className="font-semibold text-gray-900">Aide & Guides</h3>
            <p className="text-xs text-gray-600 mt-1">Apprenez à utiliser les fonctionnalités</p>
          </div>

          {/* Guide list - Scrollable */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {suggestions.length > 0 ? (
              <div className="space-y-2 p-3">
                {suggestions.map(guide => (
                  <motion.button
                    key={guide.id}
                    onClick={() => onSelectGuide(guide.id, guide.guide)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-blue-50 transition group"
                    whileHover={{ x: 4 }}
                  >
                    <div className="flex items-center gap-2">
                      {guide.emoji && <span className="text-lg">{guide.emoji}</span>}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 group-hover:text-blue-600">
                          {guide.title}
                        </p>
                      </div>
                    </div>
                  </motion.button>
                ))}
              </div>
            ) : (
              <div className="px-4 py-6 text-center">
                <p className="text-sm text-gray-600">
                  Aucun guide disponible pour le moment
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex-shrink-0">
            <p className="text-xs text-gray-600">
              💡 Les guides apparaissent automatiquement sur les pages pertinentes
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

/**
 * Main floating button component
 * Only displayed on HomePage (route: /) to show all guides
 * Positioned below the main app header
 */
export const GuideButton: React.FC<{ showOnlyOnHomePage?: boolean }> = ({ showOnlyOnHomePage = true }) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const { startTour } = useGuide();
  const suggestions = useGuideSuggestions();
  const location = window.location.pathname;

  // Debug: log suggestions
  React.useEffect(() => {
    console.log('[GuideButton] suggestions:', suggestions);
  }, [suggestions]);

  const handleSelectGuide = (guideId: string, guide?: GuideTour) => {
    console.log('[GuideButton.handleSelectGuide] guideId:', guideId, 'guide:', guide);
    startTour(guideId, guide);
    setIsPopoverOpen(false);
  };

  // Only show on HomePage (route: /) if showOnlyOnHomePage is true
  if (showOnlyOnHomePage && location !== '/') {
    return null;
  }

  return (
    <div className="fixed top-[160px] right-4 z-40 md:top-[200px] md:right-6">
      {/* Popover */}
      <div className="relative">
        <GuideSuggestionsPopover
          suggestions={suggestions}
          onSelectGuide={handleSelectGuide}
          isOpen={isPopoverOpen}
        />

        {/* Button - Same style as PageHeader Guide Button */}
        <motion.button
          onClick={() => setIsPopoverOpen(!isPopoverOpen)}
          className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-lg shadow-blue-500/40 hover:shadow-xl hover:shadow-blue-500/50 hover:scale-105 transition-all flex items-center justify-center font-bold text-lg border border-white/40"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          aria-label="Open guides"
          aria-expanded={isPopoverOpen}
          aria-haspopup="menu"
        >
          ?
        </motion.button>


        {/* Notification dot (if new guides) */}
        {suggestions.some(g => g.isNew) && (
          <motion.div
            className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  );
};
