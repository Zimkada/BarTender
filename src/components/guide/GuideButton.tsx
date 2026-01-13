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

/**
 * Popover for guide suggestions
 */
const GuideSuggestionsPopover: React.FC<{
  suggestions: Array<{ id: string; title: string; emoji?: string; isNew: boolean }>;
  onSelectGuide: (guideId: string) => void;
  isOpen: boolean;
}> = ({ suggestions, onSelectGuide, isOpen }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="absolute bottom-16 right-0 w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-40"
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">Help & Guides</h3>
            <p className="text-xs text-gray-600 mt-1">Learn how to use features</p>
          </div>

          {/* Guide list */}
          <div className="max-h-96 overflow-y-auto">
            {suggestions.length > 0 ? (
              <div className="space-y-2 p-3">
                {suggestions.map(guide => (
                  <motion.button
                    key={guide.id}
                    onClick={() => onSelectGuide(guide.id)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-blue-50 transition group"
                    whileHover={{ x: 4 }}
                  >
                    <div className="flex items-center gap-2">
                      {guide.emoji && <span className="text-lg">{guide.emoji}</span>}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 group-hover:text-blue-600">
                          {guide.title}
                        </p>
                        {guide.isNew && (
                          <span className="text-xs text-blue-600 font-semibold">
                            NEW
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.button>
                ))}
              </div>
            ) : (
              <div className="px-4 py-6 text-center">
                <p className="text-sm text-gray-600">
                  No guides available yet
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
            <p className="text-xs text-gray-600">
              💡 Guides appear on relevant pages automatically
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

/**
 * Main floating button component
 */
export const GuideButton: React.FC = () => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const { startTour } = useGuide();
  const suggestions = useGuideSuggestions();

  const handleSelectGuide = (guideId: string) => {
    startTour(guideId);
    setIsPopoverOpen(false);
  };

  return (
    <div className="fixed bottom-6 right-6 z-40 safe-area-inset-bottom">
      {/* Popover */}
      <div className="relative">
        <GuideSuggestionsPopover
          suggestions={suggestions}
          onSelectGuide={handleSelectGuide}
          isOpen={isPopoverOpen}
        />

        {/* Button */}
        <motion.button
          onClick={() => setIsPopoverOpen(!isPopoverOpen)}
          className="w-12 h-12 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 hover:shadow-xl transition flex items-center justify-center font-bold text-lg"
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
