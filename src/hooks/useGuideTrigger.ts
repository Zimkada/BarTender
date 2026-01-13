/**
 * useGuideTrigger
 * Hook to trigger guides based on page/action
 * Usage: const { startGuide } = useGuideTrigger(); startGuide('dashboard-overview');
 */

import { useEffect } from 'react';
import { useGuide } from '@/context/GuideContext';
import { DASHBOARD_OVERVIEW_GUIDE } from '@/data/guides/owner-guides';
import { GuideTour } from '@/types/guide';

/**
 * Map of all available guides
 * Add guides here as they're created
 */
const GUIDES_REGISTRY: Record<string, GuideTour> = {
  'dashboard-overview': DASHBOARD_OVERVIEW_GUIDE,
  // Phase 2+ guides will be added here
  // 'manage-inventory': MANAGE_INVENTORY_GUIDE,
  // 'analytics-overview': ANALYTICS_OVERVIEW_GUIDE,
  // etc.
};

export const useGuideTrigger = (guideId: string) => {
  const { activeTour, startTour, hasCompletedGuide } = useGuide();

  /**
   * Start a guide by ID
   */
  const triggerGuide = async () => {
    const guide = GUIDES_REGISTRY[guideId];
    if (!guide) {
      console.warn(`Guide "${guideId}" not found in registry`);
      return;
    }

    // Don't trigger if already completed (if showOnce = true)
    const shouldShow = guide.triggers.some(t => !t.showOnce || !hasCompletedGuide(guideId));

    if (shouldShow) {
      startTour(guideId);
    }
  };

  return {
    triggerGuide,
    isGuideActive: activeTour?.id === guideId,
    getGuide: () => GUIDES_REGISTRY[guideId],
  };
};

/**
 * Hook to auto-trigger guide on mount based on conditions
 * Usage: useAutoGuide('dashboard-overview', isDashboard && !hasCompletedGuide);
 */
export const useAutoGuide = (
  guideId: string,
  shouldTrigger: boolean,
  options?: { delay?: number }
) => {
  const { triggerGuide } = useGuideTrigger(guideId);

  useEffect(() => {
    if (!shouldTrigger) return;

    const timer = setTimeout(
      () => {
        triggerGuide();
      },
      options?.delay ?? 2000
    );

    return () => clearTimeout(timer);
  }, [shouldTrigger, guideId, triggerGuide, options?.delay]);
};
