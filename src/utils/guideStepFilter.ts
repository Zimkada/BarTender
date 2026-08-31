/**
 * guideStepFilter
 * Filtrage des étapes d'une visite guidée — §19.8, §20.
 *
 * ⭐⭐ SOURCE UNIQUE, et c'est la raison d'être de ce fichier.
 *
 * ⛔ LE DÉFAUT QU'IL CORRIGE. `filterStepsByRole` vivait dans
 * `useGuideSuggestions`, donc s'appliquait UNIQUEMENT à la liste « Tous les
 * guides ». Le bouton « Guide » d'une page passe par `useGuideTrigger`, qui
 * servait le guide BRUT du registre : `visibleFor` y était purement et
 * simplement ignoré. Un gérant ouvrant « Votre service en cuisine » depuis
 * l'écran Service voyait l'étape `service-6`, marquée `visibleFor:
 * ['cuisinier']`.
 *
 * ⚠️ Deux chemins d'ouverture, deux comportements : exactement le motif de
 * divergence que ce projet a déjà payé trois fois (listes blanches SQL/UI).
 * Le filtre vit donc ICI, et les deux chemins l'appellent.
 */

import type { GuideTour, UserRole } from '../types/guide';

/** Contexte d'affichage d'une visite : qui regarde, et sur quel bar. */
export interface GuideStepContext {
  role: UserRole;
  /** ⭐ §20 — cuisine opérée par le gérant seul (`isSimplifiedKitchen`). */
  isSimplifiedKitchen: boolean;
}

/**
 * Retourne le guide avec ses seules étapes pertinentes.
 *
 * ⚠️ NE FILTRE JAMAIS JUSQU'À ZÉRO SANS LE DIRE : un guide vide ouvrirait une
 * modale sans contenu. L'appelant doit traiter ce cas — voir `useGuideTrigger`,
 * qui refuse d'ouvrir une visite sans étape.
 */
export function filterGuideSteps(guide: GuideTour, ctx: GuideStepContext): GuideTour {
  return {
    ...guide,
    steps: guide.steps.filter((step) => {
      // ⭐ Absent = visible par tous les rôles (comportement historique).
      if (step.visibleFor && !step.visibleFor.includes(ctx.role)) return false;

      // ⭐ §20 — le MODE, distinct du rôle.
      if (step.hiddenInSimplifiedKitchen && ctx.isSimplifiedKitchen) return false;
      if (step.onlyInSimplifiedKitchen && !ctx.isSimplifiedKitchen) return false;

      return true;
    }),
  };
}
