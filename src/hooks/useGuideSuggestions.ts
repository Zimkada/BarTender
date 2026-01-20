/**
 * useGuideSuggestions
 * Hook to get available guides for current page/user
 * Shows all guides, marks new ones
 */

import { useMemo } from 'react';
import { useGuide } from '@/context/GuideContext';
import { useAuth } from '@/context/AuthContext';
import { OWNER_GUIDES } from '@/data/guides/owner-guides';
import { SERVEUR_GUIDES } from '@/data/guides/serveur-guides'; // Contains all 5 serveur guides
import { GuideTour, UserRole } from '@/types/guide';

/**
 * Filter guide steps by role-based visibility
 * Removes steps that don't have the current role in visibleFor
 */
const filterStepsByRole = (guide: GuideTour, role: UserRole): GuideTour => {
  return {
    ...guide,
    steps: guide.steps.filter(step => {
      // If visibleFor not specified, visible to all roles
      if (!step.visibleFor) return true;
      // Otherwise, visible only if role is in visibleFor list
      return step.visibleFor.includes(role);
    }),
  };
};

/**
 * Registry of all guides by role
 * Promoteur sees all OWNER_GUIDES
 * Gérant sees OWNER_GUIDES filtered by targetRoles
 * Serveur sees BARTENDER_GUIDES
 */
const GUIDES_BY_ROLE: Record<string, GuideTour[]> = {
  promoteur: OWNER_GUIDES,
  gerant: OWNER_GUIDES.filter(g => g.targetRoles.includes('gerant')),
  serveur: SERVEUR_GUIDES,
};

export interface GuideSuggestion {
  id: string;
  title: string;
  emoji?: string;
  description?: string;
  isNew: boolean; // Non complété encore
  estimatedDuration: number;
  guide?: GuideTour; // Objet guide complet pour startTour
}

/**
 * Get all available guides for current user
 * Shows completion status
 */
export const useGuideSuggestions = (): GuideSuggestion[] => {
  const { currentSession } = useAuth();
  const { hasCompletedGuide } = useGuide();

  const userRole = (currentSession?.role || 'serveur') as UserRole;

  return useMemo(() => {
    const guides = GUIDES_BY_ROLE[userRole] || [];

    return guides.map(guide => {
      // Filter steps by role visibility
      const filteredGuide = filterStepsByRole(guide, userRole);

      return {
        id: filteredGuide.id,
        title: filteredGuide.title,
        emoji: filteredGuide.emoji,
        description: filteredGuide.description,
        isNew: !hasCompletedGuide(filteredGuide.id),
        estimatedDuration: filteredGuide.estimatedDuration,
        guide: filteredGuide, // Include filtered guide object
      };
    });
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
