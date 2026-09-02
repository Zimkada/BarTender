/**
 * useGuideSuggestions
 * Hook to get available guides for current page/user
 * Shows all guides, marks new ones
 */

import { useMemo } from 'react';
import { useGuide } from '@/context/GuideContext';
import { useAuth } from '@/context/AuthContext';
import { useBarContext } from '@/context/BarContext';
import { OWNER_GUIDES } from '@/data/guides/owner-guides';
import { SERVEUR_GUIDES } from '@/data/guides/serveur-guides'; // Contains all 5 serveur guides
import { KITCHEN_GUIDES } from '@/data/guides/kitchen-guides';
import { GuideTour, UserRole } from '@/types/guide';
/**
 * ⭐ SOURCE UNIQUE du filtrage d'étapes — partagée avec `useGuideTrigger`.
 * ⛔ La version locale (`filterStepsByRole`) ne vivait QUE dans ce hook : le
 * bouton « Guide » d'une page ne filtrait donc rien. Deux chemins, deux
 * comportements — le motif de divergence que ce projet a déjà payé.
 */
import { filterGuideSteps } from '@/utils/guideStepFilter';

/**
 * Registry of all guides by role
 * Promoteur sees all OWNER_GUIDES
 * Gérant sees OWNER_GUIDES filtered by targetRoles
 * Serveur sees BARTENDER_GUIDES
 */
const GUIDES_BY_ROLE: Record<string, GuideTour[]> = {
  /**
   * ⭐ §19.8 — les visites cuisine s'ajoutent aux listes existantes, elles ne
   * les remplacent pas : un promoteur avec restaurant a besoin des deux.
   * ⚠️ `requiresRestaurant` les écarte pour un bar pur — cf. le filtre plus
   * bas, qui vit dans le hook et non ici.
   */
  promoteur: [...OWNER_GUIDES, ...KITCHEN_GUIDES.filter(g => g.targetRoles.includes('promoteur'))],
  /**
   * ⭐ CO-PROMOTEUR (01/09/2026) — HÉRITE des guides du promoteur.
   *
   * ⛔ Sans cette entrée, il retomberait sur le repli `|| []` plus bas et
   * n'aurait AUCUNE visite guidée — le même défaut que celui décrit pour le
   * cuisinier ci-dessous, en pire : lui n'aurait rien du tout.
   *
   * ⭐ POURQUOI RÉUTILISER `'promoteur'` DANS LE FILTRE plutôt que d'ajouter
   * `'co_promoteur'` aux `targetRoles` des 140 entrées de `owner-guides.ts` :
   * ces fichiers sont du CONTENU de formation, pas de la sécurité. Éditer 140
   * lignes pour un rôle qui voit exactement les mêmes écrans serait du bruit,
   * et chaque ligne oubliée créerait un trou silencieux. Une seule entrée ici
   * ne peut pas diverger.
   *
   * ⚠️ SEUL ÉCART RÉEL avec le promoteur : `canCreateBars`. Aucune visite
   * guidée ne porte sur la création d'un bar — elle est réservée au
   * SuperAdmin et ne passe pas par l'application.
   */
  co_promoteur: [...OWNER_GUIDES, ...KITCHEN_GUIDES.filter(g => g.targetRoles.includes('promoteur'))],
  gerant: [
    ...OWNER_GUIDES.filter(g => g.targetRoles.includes('gerant')),
    ...KITCHEN_GUIDES.filter(g => g.targetRoles.includes('gerant')),
  ],
  serveur: [...SERVEUR_GUIDES, ...KITCHEN_GUIDES.filter(g => g.targetRoles.includes('serveur'))],
  /**
   * ⭐ §19.8 — LE CUISINIER, absent jusqu'ici de ce registre.
   *
   * ⛔ Sans cette entrée il retombait sur `serveur` par le repli
   * `|| []` plus bas : il voyait donc les guides de VENTE, et aucun de ceux
   * qui décrivent son propre métier.
   *
   * ⚠️ `targetRoles` fait le tri : il ne verra que les visites qui le
   * nomment explicitement — sa file, la production, les pertes — jamais
   * « Monter votre carte » ni les écrans de coûts.
   */
  cuisinier: KITCHEN_GUIDES.filter(g => g.targetRoles.includes('cuisinier')),
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
  // ⭐ §20 — `isSimplifiedKitchen` pilote les étapes propres au geste unique.
  const { hasRestaurant, isSimplifiedKitchen } = useBarContext();

  const userRole = (currentSession?.role || 'serveur') as UserRole;

  return useMemo(() => {
    /**
     * ⛔⛔ §3 — FILTRAGE PAR RESTAURANT, à l'endroit le plus visible.
     *
     * Une visite « Monter votre carte » proposée à un bar qui ne vend que des
     * boissons ne serait pas une gêne mineure : c'est dans la liste d'aide
     * que l'utilisateur vient comprendre son application. Y trouver des
     * fonctions qu'il n'a pas lui ferait douter du reste.
     *
     * ⚠️ Le défaut (`requiresRestaurant` absent) laisse passer : les dix
     * visites existantes n'ont pas à être modifiées.
     */
    const guides = (GUIDES_BY_ROLE[userRole] || []).filter(
      g => !g.requiresRestaurant || hasRestaurant
    );

    return guides.map(guide => {
      // Filtrage rôle + mode, par la même fonction que le bouton de page.
      const filteredGuide = filterGuideSteps(guide, {
        role: userRole,
        isSimplifiedKitchen,
      });

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
  }, [userRole, hasCompletedGuide, hasRestaurant, isSimplifiedKitchen]);
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
