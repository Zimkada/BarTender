/**
 * useGuideTrigger
 * Hook to trigger guides based on page/action
 * Usage: const { startGuide } = useGuideTrigger(); startGuide('dashboard-overview');
 */

import { useEffect } from 'react';
import { useGuide } from '../context/GuideContext';
import {
  DASHBOARD_OVERVIEW_GUIDE,
  MANAGE_INVENTORY_GUIDE,
  MANAGE_RETURNS_GUIDE,
  MANAGE_CONSIGNMENTS_GUIDE,
  HISTORIQUE_GUIDE,
  MANAGE_TEAM_GUIDE,
  MANAGE_SETTINGS_GUIDE,
  MANAGE_PROMOTIONS_GUIDE,
  PROFILE_GUIDE,
  FORECASTING_AI_GUIDE,
} from '../data/guides/owner-guides';
import { SERVEUR_FIRST_SALE_GUIDE, SERVEUR_DASHBOARD_GUIDE, SERVEUR_HISTORY_GUIDE, SERVEUR_RETURNS_GUIDE, SERVEUR_CONSIGNMENTS_GUIDE } from '../data/guides/serveur-guides';
import { GuideTour, GuideTrigger } from '../types/guide';

/**
 * Map of all available guides
 * Add guides here as they're created
 */
const GUIDES_REGISTRY: Record<string, GuideTour> = {
  // Unified Owner/Manager Guides (Role-filtered by visibleFor)
  'dashboard-overview': DASHBOARD_OVERVIEW_GUIDE,
  'manage-inventory': MANAGE_INVENTORY_GUIDE,
  'manage-returns': MANAGE_RETURNS_GUIDE,
  'manage-consignments': MANAGE_CONSIGNMENTS_GUIDE,
  'analytics-overview': HISTORIQUE_GUIDE,
  'manage-team': MANAGE_TEAM_GUIDE,
  'manage-settings': MANAGE_SETTINGS_GUIDE,
  'manage-promotions': MANAGE_PROMOTIONS_GUIDE,
  'my-profile': PROFILE_GUIDE,
  'forecasting-guide': FORECASTING_AI_GUIDE,

  // Serveur Guides
  'create-first-sale': SERVEUR_FIRST_SALE_GUIDE,
  'serveur-dashboard': SERVEUR_DASHBOARD_GUIDE,
  'serveur-history': SERVEUR_HISTORY_GUIDE,
  'serveur-returns': SERVEUR_RETURNS_GUIDE,
  'serveur-consignments': SERVEUR_CONSIGNMENTS_GUIDE,
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
    const shouldShow = guide.triggers.some((t: GuideTrigger) => !t.showOnce || !hasCompletedGuide(guideId));

    if (shouldShow) {
      startTour(guideId, guide); // ✅ Pass guide object
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
  const { triggerGuide, isGuideActive } = useGuideTrigger(guideId);
  const { activeTour } = useGuide();

  useEffect(() => {
    if (!shouldTrigger) return;

    const timer = setTimeout(
      () => {
        // ✅ Only trigger if no guide is already active
        if (!activeTour) {
          triggerGuide();
        } else {
          console.log(`[useAutoGuide] Guide "${guideId}" suppressed (${activeTour.id} already active)`);
        }
      },
      options?.delay ?? 2000
    );

    return () => clearTimeout(timer);
  }, [shouldTrigger, guideId, triggerGuide, options?.delay, activeTour]);
};
