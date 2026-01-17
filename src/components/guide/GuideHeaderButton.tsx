/**
 * GuideHeaderButton
 * Button to trigger page-specific guide from PageHeader
 * Integrates with PageHeader actions
 */

import React, { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../ui/Button';
import { useGuideTrigger } from '../../hooks/useGuideTrigger';
import { useGuide } from '../../context/GuideContext';
import { useGuideSuggestions } from '../../hooks/useGuideSuggestions';
import { GuideTour } from '../../types/guide';

interface GuideHeaderButtonProps {
  guideId?: string;  // If provided, shows only this guide. If not, shows all guides
  variant?: 'default' | 'compact';
  showAllGuides?: boolean;  // If true, shows a popover with all guides
}

export const GuideHeaderButton: React.FC<GuideHeaderButtonProps> = ({
  guideId,
  variant = 'default',
  showAllGuides = false
}) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const { triggerGuide, getGuide } = useGuideTrigger(guideId || '');
  const { hasCompletedGuide, startTour } = useGuide();
  const allSuggestions = useGuideSuggestions();

  const guide = guideId ? getGuide() : null;
  const isCompleted = guideId ? hasCompletedGuide(guideId) : false;

  // For single guide mode
  const handleClick = () => {
    if (showAllGuides) {
      setIsPopoverOpen(!isPopoverOpen);
    } else if (guideId) {
      triggerGuide();
    }
  };

  // For all guides mode
  const handleSelectGuide = (selectedGuideId: string, selectedGuide?: GuideTour) => {
    if (selectedGuide) {
      startTour(selectedGuideId, selectedGuide);
    }
    setIsPopoverOpen(false);
  };

  // Popover for all guides mode
  const popover = showAllGuides && isPopoverOpen && (
    <AnimatePresence>
      <motion.div
        className="absolute top-full right-0 mt-2 w-72 md:w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-50 flex flex-col max-h-96"
        initial={{ opacity: 0, scale: 0.95, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -10 }}
        transition={{ duration: 0.2 }}
      >
        <div className="px-4 py-3 border-b border-gray-200 flex-shrink-0">
          <h3 className="font-semibold text-gray-900">Tous les Guides</h3>
          <p className="text-xs text-gray-600 mt-1">Choisissez un guide</p>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          {allSuggestions.length > 0 ? (
            <div className="space-y-2 p-3">
              {allSuggestions.map(suggestion => (
                <button
                  key={suggestion.id}
                  onClick={() => handleSelectGuide(suggestion.id, suggestion.guide)}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-blue-50 transition"
                >
                  <div className="flex items-center gap-2">
                    {suggestion.emoji && <span className="text-lg">{suggestion.emoji}</span>}
                    <p className="text-sm font-medium text-gray-900">{suggestion.title}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-gray-600">Aucun guide disponible</p>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );

  if (variant === 'compact') {
    return (
      <div className="relative">
        <Button
          onClick={handleClick}
          variant="ghost"
          size="icon"
          className="bg-sky-100 hover:bg-sky-200 text-sky-700 rounded-lg relative"
          title={guide?.title || 'Guides'}
        >
          <HelpCircle size={20} />
          {!showAllGuides && !isCompleted && (
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
          )}
        </Button>
        {popover}
      </div>
    );
  }

  return (
    <div className="relative">
      <Button
        onClick={handleClick}
        variant="ghost"
        size="sm"
        className="bg-sky-100 hover:bg-sky-200 text-sky-700 gap-2 rounded-lg font-medium relative"
      >
        <HelpCircle size={18} />
        <span className="hidden md:inline">{showAllGuides ? 'Guides' : 'Guide'}</span>
        {!showAllGuides && !isCompleted && (
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
        )}
      </Button>
      {popover}
    </div>
  );
};
