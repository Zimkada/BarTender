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
      /**
       * ⭐ CO-PROMOTEUR (01/09/2026) — lu comme un `promoteur` pour le filtrage.
       *
       * Les 140 `visibleFor` de `owner-guides.ts` (+ cuisine, comptabilité) ne
       * nomment que les rôles historiques. Sans cette équivalence, un
       * co-promoteur ouvrirait chaque visite AMPUTÉE de ses étapes — et une
       * visite filtrée jusqu'à zéro ne s'ouvre même pas (cf. `useGuideTrigger`).
       *
       * ⭐ UNE LIGNE ICI plutôt que 140 éditions : `visibleFor` est du CONTENU
       * de formation, pas de la sécurité (celle-ci vit dans `ROLE_PERMISSIONS`,
       * les RLS et les RPC). Une équivalence centralisée ne peut pas diverger,
       * là où 140 lignes éditées à la main laisseraient forcément un trou.
       *
       * ⚠️ Le co-promoteur voit exactement les mêmes écrans que le promoteur.
       * Seul `canCreateBars` les distingue — et aucune visite ne le couvre,
       * la création de bars étant réservée au SuperAdmin hors application.
       */
      const roleForGuides = ctx.role === 'co_promoteur' ? 'promoteur' : ctx.role;

      // ⭐ Absent = visible par tous les rôles (comportement historique).
      if (step.visibleFor && !step.visibleFor.includes(roleForGuides)) return false;

      // ⭐ §20 — le MODE, distinct du rôle.
      if (step.hiddenInSimplifiedKitchen && ctx.isSimplifiedKitchen) return false;
      if (step.onlyInSimplifiedKitchen && !ctx.isSimplifiedKitchen) return false;

      return true;
    }),
  };
}
