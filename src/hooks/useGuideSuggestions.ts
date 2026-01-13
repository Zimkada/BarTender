/**
 * useGuideSuggestions
 * Hook to get available guides for current page/user
 * Shows all guides, marks new ones
 */

import { useMemo } from 'react';
import { useGuide } from '@/context/GuideContext';
import { useAuth } from '@/context/AuthContext';
import { OWNER_GUIDES } from '@/data/guides/owner-guides';
import { GuideTour } from '@/types/guide';

/**
 * Registry of all guides by role
 * Add guides here as they're created (Phase 2+)
 */
const GUIDES_BY_ROLE: Record<string, GuideTour[]> = {
  promoteur: OWNER_GUIDES,
  // Phase 2+:
  // gérant: MANAGER_GUIDES,
  // serveur: BARTENDER_GUIDES,
};

export interface GuideSuggestion {
  id: string;
  title: string;
  emoji?: string;
  description?: string;
  isNew: boolean; // Not completed yet
  estimatedDuration: number;
  guide?: GuideTour; // Full guide object for startTour
}

/**
 * Get all available guides for current user
 * Shows completion status
 */
export const useGuideSuggestions = (): GuideSuggestion[] => {
  const { currentSession } = useAuth();
  const { hasCompletedGuide } = useGuide();

  const userRole = (currentSession?.role || 'serveur') as string;

  return useMemo(() => {
    const guides = GUIDES_BY_ROLE[userRole] || [];

    return guides.map(guide => ({
      id: guide.id,
      title: guide.title,
      emoji: guide.emoji,
      description: guide.description,
      isNew: !hasCompletedGuide(guide.id),
      estimatedDuration: guide.estimatedDuration,
      guide: guide, // Include full guide object
    }));
  }, [userRole, hasCompletedGuide]);
};

/**
 * Get guides for current page context
 * Useful for showing contextual guides
 * Example: On Inventory page, show only inventory-related guides
 */
export const useContextualGuides = (pageContext: string): GuideSuggestion[] => {
  const allGuides = useGuideSuggestions();

  return useMemo(() => {
    // Map page context to guide patterns
    const contextPatterns: Record<string, string[]> = {
      dashboard: ['dashboard'],
      inventory: ['inventory'],
      analytics: ['analytics'],
      team: ['team'],
      settings: ['settings'],
    };

    const patterns = contextPatterns[pageContext] || [];

    return allGuides.filter(guide =>
      patterns.some(pattern => guide.id.includes(pattern))
    );
  }, [allGuides, pageContext]);
};
