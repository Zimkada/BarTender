/**
 * useGuideTrigger
 * Hook to trigger guides based on page/action
 * Usage: const { startGuide } = useGuideTrigger(); startGuide('dashboard-overview');
 */

import { useEffect } from 'react';
import { useGuide } from '../context/GuideContext';
import { useAuth } from '../context/AuthContext';
import { useBarContext } from '../context/BarContext';
import { filterGuideSteps } from '../utils/guideStepFilter';
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
import { ACCOUNTING_MODULE_GUIDE } from '../data/guides/accounting-guides';
import {
  KITCHEN_SETUP_GUIDE,
  KITCHEN_SERVICE_GUIDE,
  KITCHEN_ORDER_GUIDE,
} from '../data/guides/kitchen-guides';
import { GuideTour, UserRole } from '../types/guide';

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
  'accounting-guide': ACCOUNTING_MODULE_GUIDE,
  // ⭐ §19.8 — module Restauration.
  'kitchen-setup': KITCHEN_SETUP_GUIDE,
  'kitchen-service': KITCHEN_SERVICE_GUIDE,
  'kitchen-order': KITCHEN_ORDER_GUIDE,
};

export const useGuideTrigger = (guideId: string) => {
  const { activeTour, startTour } = useGuide();
  const { currentSession } = useAuth();
  /**
   * ⭐ §20 — le MODE du bar entre dans le choix des étapes, pas seulement le
   * rôle. `isSimplifiedKitchen` est déjà dérivé par `BarContext` : on le
   * consomme, on ne le recalcule pas.
   */
  const { isSimplifiedKitchen } = useBarContext();
  const role = (currentSession?.role || 'serveur') as UserRole;

  /**
   * Start a guide by ID
   */
  const triggerGuide = async () => {
    const guide = GUIDES_REGISTRY[guideId];
    if (!guide) {
      console.warn(`Guide "${guideId}" not found in registry`);
      return;
    }

    /**
     * ⛔⛔ UN CLIC EXPLICITE N'EST PAS UN DÉCLENCHEMENT AUTOMATIQUE.
     *
     * Cette fonction consultait `guide.triggers` avant d'ouvrir la visite :
     *
     *     const shouldShow = guide.triggers.some(t => !t.showOnce || ...);
     *
     * ⚠️ `[].some(...)` vaut TOUJOURS `false`. Les trois guides du module
     * Restauration (`kitchen-setup`, `kitchen-service`, `kitchen-order`) sont
     * les SEULS du projet déclarés `triggers: []` : leur bouton « Guide » ne
     * faisait donc RIEN. Aucune erreur, aucun avertissement — le guide était
     * bien trouvé dans le registre, il ne démarrait simplement jamais.
     *
     * ⭐ `triggers` décrit quand une visite s'ouvre TOUTE SEULE (`useAutoGuide`).
     * Quand l'utilisateur APPUIE sur le bouton, la question ne se pose plus :
     * il vient de la poser lui-même. `showOnce` non plus n'a pas de sens ici,
     * il refuserait de rouvrir un guide déjà terminé — exactement ce qu'on
     * demande en rappuyant sur « Guide ».
     */
    /**
     * ⛔⛔ FILTRER AVANT D'OUVRIR — second défaut du même constat terrain.
     *
     * Ce chemin servait le guide BRUT du registre : `visibleFor` n'était
     * appliqué que par `useGuideSuggestions` (la liste « Tous les guides »).
     * Un gérant ouvrant « Votre service en cuisine » depuis l'écran Service
     * voyait donc `service-6`, réservée au cuisinier.
     *
     * ⭐ Le filtre porte AUSSI le mode (§20) : en cuisine simplifiée, les
     * étapes qui enseignent « Commencer » / « Prêt » décrivent des boutons
     * que l'écran n'affiche pas.
     */
    const visible = filterGuideSteps(guide, { role, isSimplifiedKitchen });

    /**
     * ⚠️ UNE VISITE SANS ÉTAPE N'EST PAS UNE VISITE. Ouvrir la modale
     * afficherait un cadre vide avec une barre de progression à NaN.
     */
    if (visible.steps.length === 0) {
      console.warn(`Guide "${guideId}" n'a aucune étape visible dans ce contexte`);
      return;
    }

    startTour(guideId, visible);
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
