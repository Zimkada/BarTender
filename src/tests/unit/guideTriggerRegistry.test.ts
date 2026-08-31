/**
 * guideTriggerRegistry.test.ts
 *
 * ⭐⭐ LE BOUTON « GUIDE » DOIT OUVRIR LA VISITE — constat terrain.
 *
 * ⛔ LE DÉFAUT. `triggerGuide` consultait `guide.triggers` avant d'ouvrir :
 *
 *     const shouldShow = guide.triggers.some(t => !t.showOnce || ...);
 *     if (shouldShow) startTour(...);
 *
 * `[].some(...)` vaut TOUJOURS `false`. Les trois guides du module
 * Restauration sont les SEULS déclarés `triggers: []` : leur bouton ne
 * faisait rien. Silencieux — le guide était trouvé dans le registre, donc
 * même pas de `console.warn`.
 *
 * ⚠️ CE QUE CE FICHIER PROTÈGE, et pourquoi il ne teste pas que le registre :
 * vérifier que `kitchen-service` est enregistré n'aurait RIEN vu — il l'était.
 * C'est le CHEMIN D'OUVERTURE qui était rompu. On appelle donc le vrai hook.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const startTour = vi.fn();
const hasCompletedGuide = vi.fn(() => false);

/** ⭐ Pilotés par test : le rôle et le MODE changent les étapes servies. */
let mockRole = 'gerant';
let mockSimplifiedKitchen = false;

vi.mock('../../context/GuideContext', () => ({
  useGuide: () => ({ activeTour: null, startTour, hasCompletedGuide }),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ currentSession: { role: mockRole } }),
}));

vi.mock('../../context/BarContext', () => ({
  useBarContext: () => ({ isSimplifiedKitchen: mockSimplifiedKitchen }),
}));

import { useGuideTrigger } from '../../hooks/useGuideTrigger';

/**
 * ⭐ Les guides à `triggers: []` — ceux que le défaut rendait inaccessibles.
 * ⚠️ `kitchen-order` compris : c'est le bouton du SERVEUR sur l'écran Service.
 */
const GUIDES_SANS_TRIGGER = ['kitchen-setup', 'kitchen-service', 'kitchen-order'];

/** Un guide à triggers non vides — témoin de non-régression. */
const GUIDE_AVEC_TRIGGER = 'manage-inventory';

describe('useGuideTrigger — un clic explicite ouvre toujours la visite', () => {
  beforeEach(() => {
    startTour.mockClear();
    hasCompletedGuide.mockReturnValue(false);
    mockRole = 'gerant';
    mockSimplifiedKitchen = false;
  });

  it.each(GUIDES_SANS_TRIGGER)(
    '⛔ « %s » (triggers: []) démarre malgré tout',
    async (id) => {
      const { result } = renderHook(() => useGuideTrigger(id));

      await act(async () => {
        await result.current.triggerGuide();
      });

      expect(
        startTour,
        `Le bouton Guide de « ${id} » n'ouvre rien — regression du defaut terrain`
      ).toHaveBeenCalledWith(id, expect.objectContaining({ id }));
    }
  );

  it("⭐ un guide DÉJÀ TERMINÉ se rouvre — c'est ce qu'on demande en rappuyant", () => {
    /**
     * `showOnce` gouverne l'ouverture AUTOMATIQUE. Appliqué à un clic, il
     * refuserait la visite à qui la redemande explicitement.
     */
    hasCompletedGuide.mockReturnValue(true);
    const { result } = renderHook(() => useGuideTrigger('kitchen-service'));

    act(() => {
      result.current.triggerGuide();
    });

    expect(startTour).toHaveBeenCalledTimes(1);
  });

  it("⚠️ un guide à triggers non vides n'a pas régressé", () => {
    const { result } = renderHook(() => useGuideTrigger(GUIDE_AVEC_TRIGGER));

    act(() => {
      result.current.triggerGuide();
    });

    expect(startTour).toHaveBeenCalledWith(
      GUIDE_AVEC_TRIGGER,
      expect.objectContaining({ id: GUIDE_AVEC_TRIGGER })
    );
  });

  it("⛔ un id inconnu n'ouvre RIEN et ne lève pas", () => {
    // La garde du registre reste la seule raison légitime de ne rien faire.
    const { result } = renderHook(() => useGuideTrigger('guide-inexistant'));

    act(() => {
      result.current.triggerGuide();
    });

    expect(startTour).not.toHaveBeenCalled();
  });

  /**
   * ⭐ Le bouton passe `guideId` au hook et lit `getGuide()` pour son libellé :
   * un guide absent du registre afficherait un bouton sans titre.
   */
  it.each(GUIDES_SANS_TRIGGER)('« %s » est bien dans le registre', (id) => {
    const { result } = renderHook(() => useGuideTrigger(id));
    expect(result.current.getGuide()).toBeDefined();
  });
});

/** Les ids d'étapes servis à `startTour` lors du dernier appel. */
const servedStepIds = (): string[] =>
  (startTour.mock.calls[startTour.mock.calls.length - 1]?.[1]?.steps ?? []).map((s: { id: string }) => s.id);

/**
 * ⭐⭐ §20 — LE CONTENU DOIT SUIVRE L'ÉCRAN.
 *
 * ⛔ En cuisine simplifiée l'écran Service condense ses trois colonnes et
 * n'expose qu'un bouton « Plat servi ». Une étape qui enseigne « Commencer »
 * puis « Prêt » envoie donc le gérant chercher des boutons absents.
 */
describe('§20 — les étapes suivent le mode du bar', () => {
  beforeEach(() => {
    startTour.mockClear();
    hasCompletedGuide.mockReturnValue(false);
    mockRole = 'gerant';
    mockSimplifiedKitchen = false;
  });

  it("⛔ en cuisine SIMPLIFIÉE, l'étape « Prêt » disparaît", () => {
    mockSimplifiedKitchen = true;
    const { result } = renderHook(() => useGuideTrigger('kitchen-service'));

    act(() => {
      result.current.triggerGuide();
    });

    const ids = servedStepIds();
    expect(ids, 'service-2 nomme un bouton absent en mode simplifie').not.toContain('service-2');
    expect(ids).toContain('service-2-simplifie');
  });

  it("⭐ en mode COMPLET, c'est l'inverse — aucune régression", () => {
    mockSimplifiedKitchen = false;
    const { result } = renderHook(() => useGuideTrigger('kitchen-service'));

    act(() => {
      result.current.triggerGuide();
    });

    const ids = servedStepIds();
    expect(ids).toContain('service-2');
    expect(
      ids,
      'l etape du geste unique n a pas de sens en mode complet'
    ).not.toContain('service-2-simplifie');
  });

  /**
   * ⛔⛔ LE SECOND DÉFAUT DU MÊME CONSTAT. `visibleFor` n'était appliqué que
   * par `useGuideSuggestions` (liste « Tous les guides »). Le bouton d'une
   * page servait le guide BRUT : un gérant voyait `service-6`, marquée
   * `visibleFor: ['cuisinier']`.
   */
  it('⛔ `visibleFor` est respecté par le bouton de page aussi', () => {
    mockRole = 'gerant';
    const { result } = renderHook(() => useGuideTrigger('kitchen-service'));

    act(() => {
      result.current.triggerGuide();
    });

    expect(
      servedStepIds(),
      'service-6 est reservee au cuisinier (visibleFor)'
    ).not.toContain('service-6');
  });

  it('⭐ le CUISINIER garde son étape réservée', () => {
    mockRole = 'cuisinier';
    const { result } = renderHook(() => useGuideTrigger('kitchen-service'));

    act(() => {
      result.current.triggerGuide();
    });

    expect(servedStepIds()).toContain('service-6');
  });
});
